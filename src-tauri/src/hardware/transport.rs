use crate::hardware::errors::HardwareError;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// 统一字节流抽象：串口、以及测试用的模拟设备都实现它。
///
/// 所有协议逻辑只依赖这个 trait，因此“没有真机”也可以完整测试（阶段 4 验收要求）。
pub trait Transport: Send {
    fn write_all(&mut self, bytes: &[u8]) -> Result<(), HardwareError>;

    /// 读取最多 `buffer.len()` 字节；没有数据时返回 0。
    fn read(&mut self, buffer: &mut [u8]) -> Result<usize, HardwareError>;

    /// 当前可读字节数，用于避免忙等。
    fn bytes_available(&mut self) -> Result<usize, HardwareError>;

    /// 底层连接是否仍然存在。
    ///
    /// 串口被拔掉时，Windows 的 `bytes_to_read` 有时会持续返回 0 而不是报错，
    /// 只靠读取错误无法发现断线；协议层会周期性调用这个探针。
    /// 模拟/测试传输默认认为连接一直有效。
    fn is_connected(&mut self) -> Result<bool, HardwareError> {
        Ok(true)
    }
}

/// 让 `Box<dyn Transport>` 也是 `Transport`，这样设备会话可以持有“运行时才知道具体实现”的字节流：
/// 生产环境是串口，测试环境是模拟设备。
impl Transport for Box<dyn Transport> {
    fn write_all(&mut self, bytes: &[u8]) -> Result<(), HardwareError> {
        (**self).write_all(bytes)
    }

    fn read(&mut self, buffer: &mut [u8]) -> Result<usize, HardwareError> {
        (**self).read(buffer)
    }

    fn bytes_available(&mut self) -> Result<usize, HardwareError> {
        (**self).bytes_available()
    }

    fn is_connected(&mut self) -> Result<bool, HardwareError> {
        (**self).is_connected()
    }
}

/// 读取结果。`matched` 为 false 表示超时返回（不是错误，由协议层决定是否致命）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadUntil {
    pub data: Vec<u8>,
    pub matched: bool,
}

pub struct ReadUntilOptions<'a> {
    /// 期望的结束标记。
    pub ending: &'a [u8],
    /// 两个字节之间的最长等待时间；`None` 表示不限制（只靠整体超时或取消结束）。
    pub char_timeout: Option<Duration>,
    /// 整个读取过程的上限。
    pub overall_timeout: Option<Duration>,
    /// 用户取消标志。
    pub cancel: Option<&'a AtomicBool>,
    /// true：把读到的字节放进返回值；false：通过 `on_chunk` 按到达顺序流出，返回值不含数据。
    pub keep_all: bool,
    /// 运行期间待发送到设备的程序输入；读循环空闲时把它写进串口。
    pub stdin: Option<&'a Mutex<VecDeque<u8>>>,
}

impl<'a> ReadUntilOptions<'a> {
    pub fn new(ending: &'a [u8]) -> Self {
        Self {
            ending,
            char_timeout: None,
            overall_timeout: None,
            cancel: None,
            keep_all: true,
            stdin: None,
        }
    }

    pub fn char_timeout(mut self, timeout: Option<Duration>) -> Self {
        self.char_timeout = timeout;
        self
    }

    pub fn overall_timeout(mut self, timeout: Option<Duration>) -> Self {
        self.overall_timeout = timeout;
        self
    }

    pub fn cancel(mut self, cancel: &'a AtomicBool) -> Self {
        self.cancel = Some(cancel);
        self
    }

    pub fn keep_all(mut self, keep_all: bool) -> Self {
        self.keep_all = keep_all;
        self
    }

    pub fn stdin(mut self, stdin: Option<&'a Mutex<VecDeque<u8>>>) -> Self {
        self.stdin = stdin;
        self
    }
}

/// 流式模式（`keep_all = false`）下，缓冲区里除“可能与结束标记重叠的尾巴”之外的字节
/// 会在每次读取后立刻流出：界面实时，内存也有界。
///
/// 需要留下的**只是** pending 尾部那段“恰好是结束标记前缀”的字节：例如结束标记是
/// `>>> `，尾部是 `>>` 时必须留下（下一个字节可能是 `> `），而尾部是 `k\r\n` 时
/// 可以直接流出，不会把标记冲掉。早先按“固定留 `len-1` 字节”的做法会让死循环程序
/// 的结尾 3 个字节永远卡在缓冲区里，界面看起来像少字。
fn marker_overlap(pending: &[u8], ending: &[u8]) -> usize {
    let max = pending.len().min(ending.len().saturating_sub(1));
    (1..=max)
        .rev()
        .find(|length| pending[pending.len() - length..] == ending[..*length])
        .unwrap_or(0)
}

/// 静默断线探测的间隔。串口轮询本身是 2ms 一次，不能每次都枚举系统串口。
const LIVENESS_PROBE_INTERVAL: Duration = Duration::from_millis(500);

fn ensure_connected<T: Transport + ?Sized>(transport: &mut T) -> Result<(), HardwareError> {
    if transport.is_connected()? {
        Ok(())
    } else {
        Err(HardwareError::disconnected("串口连接已中断"))
    }
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || needle.len() > haystack.len() {
        return None;
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// 读取直到出现 `ending`，返回的内容**不含**结束标记。
///
/// 关键约定：**读到结束标记就停下，标记之后的字节留在 `pending` 里给下一次调用**。
/// 设备经常把下一次的横幅/提示符粘在同一次输出里（例如软复位应答是
/// `OK\r\nsoft reboot\r\n` 紧跟新的 Raw REPL 横幅），所以按“内容匹配”而不是
/// “结尾匹配”来判定，并且不越界消费。
pub fn read_until<T: Transport + ?Sized>(
    transport: &mut T,
    pending: &mut VecDeque<u8>,
    options: &ReadUntilOptions<'_>,
    mut on_chunk: impl FnMut(&[u8]),
) -> Result<ReadUntil, HardwareError> {
    let mut buffer = [0u8; 512];
    let started = Instant::now();
    let mut last_byte = Instant::now();
    let mut next_liveness_probe = Instant::now() + LIVENESS_PROBE_INTERVAL;

    loop {
        if options
            .cancel
            .is_some_and(|flag| flag.load(Ordering::SeqCst))
        {
            return Err(HardwareError::cancelled());
        }

        if Instant::now() >= next_liveness_probe {
            ensure_connected(transport)?;
            next_liveness_probe = Instant::now() + LIVENESS_PROBE_INTERVAL;
        }

        // 只在确认“缓冲区里没有结束标记”之后才把安全前缀流出，
        // 这样既保证界面实时（不会等到缓冲区满了才吐数据），又不会把标记冲掉。
        if !options.ending.is_empty() {
            let haystack = pending.make_contiguous();
            if let Some(index) = find(haystack, options.ending) {
                let end = index + options.ending.len();
                // 返回值不含结束标记本身：Raw REPL 的输出用 0x04 收尾，
                // 标记必须被吃掉而不能算作内容（否则空 stderr 会变成一个 0x04）。
                if options.keep_all {
                    let data: Vec<u8> = pending.drain(..index).collect();
                    pending.drain(..options.ending.len());
                    return Ok(ReadUntil {
                        data,
                        matched: true,
                    });
                }
                let content: Vec<u8> = pending.drain(..end).collect();
                on_chunk(&content[..index]);
                return Ok(ReadUntil {
                    data: Vec::new(),
                    matched: true,
                });
            }
        }
        if !options.keep_all {
            // 只留下“可能是结束标记开头”的尾巴，其余立刻流出。
            let keep = marker_overlap(pending.make_contiguous(), options.ending);
            let flush = pending.len().saturating_sub(keep);
            if flush > 0 {
                let chunk: Vec<u8> = pending.drain(..flush).collect();
                on_chunk(&chunk);
            }
        }

        // 程序运行时把界面输入的字节写进串口；没有输入就继续读设备输出。
        if let Some(stdin) = options.stdin {
            let mut queue = stdin.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            if !queue.is_empty() {
                let data: Vec<u8> = queue.drain(..).collect();
                drop(queue);
                transport.write_all(&data)?;
            }
        }

        let available = transport.bytes_available()?;
        if available > 0 {
            let read = transport.read(&mut buffer)?;
            if read > 0 {
                last_byte = Instant::now();
                pending.extend(buffer[..read].iter().copied());
                continue;
            }
        }

        if options
            .char_timeout
            .is_some_and(|timeout| last_byte.elapsed() >= timeout)
        {
            return Ok(unmatched(pending, options.keep_all, &mut on_chunk));
        }
        if options
            .overall_timeout
            .is_some_and(|timeout| started.elapsed() >= timeout)
        {
            return Ok(unmatched(pending, options.keep_all, &mut on_chunk));
        }
        std::thread::sleep(Duration::from_millis(2));
    }
}

fn unmatched(
    pending: &mut VecDeque<u8>,
    keep_all: bool,
    on_chunk: &mut impl FnMut(&[u8]),
) -> ReadUntil {
    let data: Vec<u8> = pending.drain(..).collect();
    if keep_all {
        ReadUntil {
            data,
            matched: false,
        }
    } else {
        on_chunk(&data);
        ReadUntil {
            data: Vec::new(),
            matched: false,
        }
    }
}

/// 精确读取 `length` 字节。设备把应答（如 `OK`）和后续输出一起发来时，
/// 多余的字节会留在 `pending` 里，不会丢。
pub fn read_exact<T: Transport + ?Sized>(
    transport: &mut T,
    pending: &mut VecDeque<u8>,
    length: usize,
    timeout: Duration,
) -> Result<Vec<u8>, HardwareError> {
    let deadline = Instant::now() + timeout;
    let mut buffer = [0u8; 128];
    let mut next_liveness_probe = Instant::now() + LIVENESS_PROBE_INTERVAL;
    loop {
        if pending.len() >= length {
            return Ok(pending.drain(..length).collect());
        }
        if Instant::now() >= next_liveness_probe {
            ensure_connected(transport)?;
            next_liveness_probe = Instant::now() + LIVENESS_PROBE_INTERVAL;
        }
        let available = transport.bytes_available()?;
        if available > 0 {
            let read = transport.read(&mut buffer)?;
            if read > 0 {
                pending.extend(buffer[..read].iter().copied());
                continue;
            }
        }
        if Instant::now() >= deadline {
            return Err(HardwareError::timeout(format!(
                "等待设备应答超时（需要 {length} 字节，收到 {} 字节）",
                pending.len()
            )));
        }
        std::thread::sleep(Duration::from_millis(2));
    }
}

/// 丢弃缓冲区与设备输入里尚未处理的字节，返回丢弃的字节数。
/// 进入 Raw REPL 前用它清掉回显、启动日志和可能残留的提示符。
pub fn drain_input<T: Transport + ?Sized>(
    transport: &mut T,
    pending: &mut VecDeque<u8>,
) -> Result<usize, HardwareError> {
    let mut total = pending.len();
    pending.clear();
    let mut buffer = [0u8; 512];
    loop {
        let available = transport.bytes_available()?;
        if available == 0 {
            return Ok(total);
        }
        let read = transport.read(&mut buffer)?;
        if read == 0 {
            return Ok(total);
        }
        total += read;
    }
}

/// 测试用传输：把预置的“设备输出”喂给协议层。
#[cfg(test)]
#[derive(Default)]
pub struct RecordingTransport {
    pub output: VecDeque<u8>,
}

#[cfg(test)]
impl RecordingTransport {
    pub fn with_output(bytes: &[u8]) -> Self {
        Self {
            output: bytes.iter().copied().collect(),
        }
    }

    pub fn append_output(&mut self, bytes: &[u8]) {
        self.output.extend(bytes.iter().copied());
    }
}

#[cfg(test)]
impl Transport for RecordingTransport {
    fn write_all(&mut self, _bytes: &[u8]) -> Result<(), HardwareError> {
        Ok(())
    }

    fn read(&mut self, buffer: &mut [u8]) -> Result<usize, HardwareError> {
        let mut read = 0;
        while read < buffer.len() {
            match self.output.pop_front() {
                Some(byte) => {
                    buffer[read] = byte;
                    read += 1;
                }
                None => break,
            }
        }
        Ok(read)
    }

    fn bytes_available(&mut self) -> Result<usize, HardwareError> {
        Ok(self.output.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hardware::errors::HardwareErrorKind;

    struct UnpluggedTransport;

    impl Transport for UnpluggedTransport {
        fn write_all(&mut self, _bytes: &[u8]) -> Result<(), HardwareError> {
            Ok(())
        }

        fn read(&mut self, _buffer: &mut [u8]) -> Result<usize, HardwareError> {
            Ok(0)
        }

        fn bytes_available(&mut self) -> Result<usize, HardwareError> {
            // 真机拔线后 `bytes_to_read` 有时会一直返回 0，而不是报错。
            Ok(0)
        }

        fn is_connected(&mut self) -> Result<bool, HardwareError> {
            Ok(false)
        }
    }

    fn char_timeout(timeout: u64) -> Option<Duration> {
        Some(Duration::from_millis(timeout))
    }

    #[test]
    fn stops_at_the_marker_and_keeps_the_trailing_bytes_for_the_next_read() {
        let mut transport =
            RecordingTransport::with_output(b"OK\r\nsoft reboot\r\nraw REPL; CTRL-B to exit\r\n>");
        let mut pending = VecDeque::new();
        let options = ReadUntilOptions::new(b"soft reboot\r\n").char_timeout(char_timeout(20));

        let outcome = read_until(&mut transport, &mut pending, &options, |_| {}).expect("read");

        assert!(outcome.matched);
        // 返回值不含结束标记本身。
        assert_eq!(String::from_utf8_lossy(&outcome.data), "OK\r\n");
        // 后面的横幅属于下一次读取，不能被吞掉。
        assert_eq!(
            String::from_utf8_lossy(pending.make_contiguous()),
            "raw REPL; CTRL-B to exit\r\n>"
        );
    }

    #[test]
    fn finds_a_marker_that_spans_two_reads() {
        let mut transport = RecordingTransport::with_output(b"x\r\n");
        let mut pending = VecDeque::new();
        transport.append_output(b">y");
        let options = ReadUntilOptions::new(b"\r\n>").char_timeout(char_timeout(20));

        let outcome = read_until(&mut transport, &mut pending, &options, |_| {}).expect("read");

        assert!(outcome.matched);
        assert_eq!(String::from_utf8_lossy(&outcome.data), "x");
        assert_eq!(String::from_utf8_lossy(pending.make_contiguous()), "y");
    }

    #[test]
    fn streams_output_in_arrival_order_when_keep_all_is_disabled() {
        let mut transport = RecordingTransport::with_output(b"tick 1\r\ntick 2\r\n>>> ");
        let mut pending = VecDeque::new();
        let options = ReadUntilOptions::new(b">>> ")
            .char_timeout(char_timeout(20))
            .keep_all(false);
        let mut streamed = Vec::new();

        let outcome = read_until(&mut transport, &mut pending, &options, |chunk| {
            streamed.extend_from_slice(chunk)
        })
        .expect("read");

        assert!(outcome.matched);
        assert!(outcome.data.is_empty());
        // 提示符本身是结束标记，不进入输出流。
        assert_eq!(String::from_utf8_lossy(&streamed), "tick 1\r\ntick 2\r\n");
        assert!(pending.is_empty());
    }

    #[test]
    fn only_holds_back_bytes_that_could_start_the_marker() {
        assert_eq!(marker_overlap(b"", b">>> "), 0);
        assert_eq!(marker_overlap(b"tick\r\n", b">>> "), 0);
        assert_eq!(marker_overlap(b"tick>", b">>> "), 1);
        assert_eq!(marker_overlap(b"tick>>", b">>> "), 2);
        // 完整标记由 `find` 先行处理，这里只保证“可能还没收全的标记”不会被冲掉。
        assert_eq!(marker_overlap(b">>>", b">>> "), 3);
        assert_eq!(marker_overlap(b"abc", b""), 0);
    }

    #[test]
    fn streams_a_tail_that_cannot_start_the_marker_without_waiting_for_timeout() {
        // 死循环程序打印完最后几个字节后不再输出：这些字节必须立刻可见，
        // 否则界面会一直少最后几个字符（旧实现固定留 `标记长度-1` 字节）。
        let cancel = std::sync::Arc::new(AtomicBool::new(false));
        let mut transport = RecordingTransport::with_output(b"blink");
        let mut pending = VecDeque::new();
        let options = ReadUntilOptions::new(b">>> ")
            .cancel(&cancel)
            .keep_all(false);
        let mut streamed = Vec::new();

        let flag = std::sync::Arc::clone(&cancel);
        let watcher = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            flag.store(true, Ordering::SeqCst);
        });
        let error = read_until(&mut transport, &mut pending, &options, |chunk| {
            streamed.extend_from_slice(chunk)
        })
        .expect_err("cancel wins");
        watcher.join().expect("join");

        assert_eq!(
            error.kind(),
            crate::hardware::errors::HardwareErrorKind::Cancelled
        );
        assert_eq!(String::from_utf8_lossy(&streamed), "blink");
        assert!(pending.is_empty());
    }

    #[test]
    fn bounds_memory_while_streaming_long_output() {
        let mut transport = RecordingTransport::with_output(&vec![b'a'; 8000]);
        let mut pending = VecDeque::new();
        let options = ReadUntilOptions::new(b"ZZZ")
            .char_timeout(char_timeout(20))
            .keep_all(false);
        let mut streamed = 0usize;

        let outcome = read_until(&mut transport, &mut pending, &options, |chunk| {
            streamed += chunk.len()
        })
        .expect("read");

        assert!(!outcome.matched);
        assert_eq!(streamed, 8000);
        // 结束标记是 "ZZZ"，所以只留 2 个字节的尾巴。
        assert!(pending.len() <= 2);
    }

    #[test]
    fn returns_what_it_read_when_the_marker_never_arrives() {
        let mut transport = RecordingTransport::with_output(b"partial");
        let mut pending = VecDeque::new();
        let options = ReadUntilOptions::new(b">").char_timeout(char_timeout(10));

        let outcome = read_until(&mut transport, &mut pending, &options, |_| {}).expect("read");

        assert!(!outcome.matched);
        assert_eq!(String::from_utf8_lossy(&outcome.data), "partial");
    }

    #[test]
    fn waits_forever_for_silence_when_no_character_timeout_is_set() {
        let mut transport = RecordingTransport::with_output(b"still working");
        let mut pending = VecDeque::new();
        // 只设整体超时：程序静静运行期间不能把“没有输出”当成结束。
        let options = ReadUntilOptions::new(b">").overall_timeout(char_timeout(15));

        let outcome = read_until(&mut transport, &mut pending, &options, |_| {}).expect("read");

        assert!(!outcome.matched);
        assert_eq!(String::from_utf8_lossy(&outcome.data), "still working");
    }

    #[test]
    fn stops_when_the_user_cancels() {
        let mut transport = RecordingTransport::default();
        let mut pending = VecDeque::new();
        let cancel = AtomicBool::new(true);
        let options = ReadUntilOptions::new(b">")
            .char_timeout(char_timeout(20))
            .cancel(&cancel);

        let error =
            read_until(&mut transport, &mut pending, &options, |_| {}).expect_err("cancel wins");

        assert_eq!(
            error.kind(),
            crate::hardware::errors::HardwareErrorKind::Cancelled
        );
    }

    #[test]
    fn detects_a_silently_unplugged_device_even_when_no_bytes_arrive() {
        let mut transport = UnpluggedTransport;
        let mut pending = VecDeque::new();
        let options = ReadUntilOptions::new(b">").overall_timeout(char_timeout(3000));
        let started = Instant::now();

        let error =
            read_until(&mut transport, &mut pending, &options, |_| {}).expect_err("unplugged");

        assert_eq!(error.kind(), HardwareErrorKind::Disconnected);
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn detects_a_silently_unplugged_device_while_waiting_for_an_exact_ack() {
        let mut transport = UnpluggedTransport;
        let mut pending = VecDeque::new();

        let error = read_exact(&mut transport, &mut pending, 2, Duration::from_secs(3))
            .expect_err("unplugged");

        assert_eq!(error.kind(), HardwareErrorKind::Disconnected);
    }

    #[test]
    fn reads_an_exact_number_of_bytes_and_keeps_the_rest() {
        let mut transport = RecordingTransport::with_output(b"OKrest");
        let mut pending = VecDeque::new();

        let ack = read_exact(&mut transport, &mut pending, 2, Duration::from_millis(50))
            .expect("read exact");

        assert_eq!(ack, b"OK");
        assert_eq!(String::from_utf8_lossy(pending.make_contiguous()), "rest");
    }

    #[test]
    fn reports_a_timeout_when_too_few_bytes_arrive() {
        let mut transport = RecordingTransport::with_output(b"O");
        let mut pending = VecDeque::new();

        let error = read_exact(&mut transport, &mut pending, 2, Duration::from_millis(10))
            .expect_err("timeout");

        assert_eq!(
            error.kind(),
            crate::hardware::errors::HardwareErrorKind::Timeout
        );
    }

    #[test]
    fn drains_pending_input_from_both_the_buffer_and_the_device() {
        let mut transport = RecordingTransport::with_output(b"leftover echo>");
        let mut pending: VecDeque<u8> = b"buffered".iter().copied().collect();

        let drained = drain_input(&mut transport, &mut pending).expect("drain");

        assert_eq!(drained, 8 + 14);
        assert!(pending.is_empty());
        assert_eq!(transport.bytes_available().expect("available"), 0);
    }
}
