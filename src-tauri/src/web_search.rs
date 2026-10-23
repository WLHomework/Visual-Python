use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Serialize)]
struct WebSearchItem {
    title: String,
    url: String,
    snippet: String,
}

fn decode_html_entities(value: &str) -> String {
    let mut output = String::new();
    let mut rest = value;
    while let Some(index) = rest.find('&') {
        output.push_str(&rest[..index]);
        let after = &rest[index + 1..];
        let entity = after
            .find(';')
            .filter(|semicolon| *semicolon <= 12)
            .map(|semicolon| (&after[..semicolon], &after[semicolon + 1..]));
        let Some((name, tail)) = entity else {
            output.push('&');
            rest = after;
            continue;
        };
        let decoded = match name {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" | "#39" => Some('\''),
            "nbsp" => Some(' '),
            _ if name.starts_with("#x") || name.starts_with("#X") => u32::from_str_radix(
                &name[2..],
                16,
            )
            .ok()
            .and_then(char::from_u32),
            _ if name.starts_with('#') => name[1..].parse::<u32>().ok().and_then(char::from_u32),
            _ => None,
        };
        if let Some(character) = decoded {
            output.push(character);
            rest = tail;
        } else {
            output.push('&');
            rest = after;
        }
    }
    output.push_str(rest);
    output
}

fn html_to_text(value: &str) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    for character in value.chars() {
        match character {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                text.push(' ');
            }
            _ if !in_tag => text.push(character),
            _ => {}
        }
    }
    let mut normalized = decode_html_entities(&text)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    for punctuation in [".", ",", "!", "?", ";", ":", ")", "]", "}"] {
        normalized = normalized.replace(&format!(" {punctuation}"), punctuation);
    }
    normalized
}

fn paragraph_after<'a>(html: &'a str, marker: &str) -> Option<&'a str> {
    let after_marker = html.find(marker)? + marker.len();
    let paragraph = after_marker + html[after_marker..].find("<p")?;
    let content = paragraph + html[paragraph..].find('>')? + 1;
    let end = content + html[content..].find("</p>")?;
    Some(&html[content..end])
}

fn parse_bing_search_results(html: &str, limit: usize) -> Vec<WebSearchItem> {
    let mut items = Vec::new();
    let mut cursor = 0;
    while items.len() < limit {
        let Some(relative_start) = html[cursor..].find("<li class=\"b_algo\"") else {
            break;
        };
        let start = cursor + relative_start;
        let end = html[start..]
            .find("</li>")
            .map(|offset| start + offset + 5)
            .unwrap_or(html.len());
        let block = &html[start..end];
        if let Some((url, title)) = (|| {
            let h2 = block.find("<h2")?;
            let anchor = block[h2..].find("<a")? + h2;
            let href_marker = block[anchor..].find("href=\"")? + anchor;
            let href_start = href_marker + 6;
            let href_end = block[href_start..].find('"')? + href_start;
            let title_start = block[href_end..].find('>')? + href_end + 1;
            let title_end = block[title_start..].find("</a>")? + title_start;
            let url = decode_html_entities(block[href_start..href_end].trim())
                .trim()
                .to_string();
            let title = html_to_text(&block[title_start..title_end]);
            (!url.is_empty() && !title.is_empty()).then_some((url, title))
        })() {
            let snippet = paragraph_after(block, "</h2>")
                .map(html_to_text)
                .unwrap_or_default();
            if !items.iter().any(|item: &WebSearchItem| item.url == url) {
                items.push(WebSearchItem {
                    title,
                    url,
                    snippet,
                });
            }
        }
        cursor = end;
    }
    items
}

#[tauri::command]
pub async fn web_search(query: String, max_results: Option<u32>) -> Result<Value, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Err("搜索词不能为空".into());
    }
    if query.chars().count() > 300 {
        return Err("搜索词不能超过 300 个字符".into());
    }
    let limit = max_results.unwrap_or(5).clamp(1, 10) as usize;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("无法创建网页搜索请求：{error}"))?;
    let mut search_url = url::Url::parse("https://www.bing.com/search")
        .map_err(|error| format!("无法创建搜索地址：{error}"))?;
    search_url
        .query_pairs_mut()
        .append_pair("q", &query)
        .append_pair("cc", "US")
        .append_pair("setlang", "en-US");
    let response = client
        .get(search_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .header("Accept-Language", "en-US,en;q=0.9,zh-CN;q=0.8")
        .send()
        .await
        .map_err(|error| format!("网页搜索请求失败：{error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("网页搜索失败（HTTP {}）", status.as_u16()));
    }
    let html = response
        .text()
        .await
        .map_err(|error| format!("读取网页搜索结果失败：{error}"))?;
    let results = parse_bing_search_results(&html, limit);
    Ok(serde_json::json!({ "query": query, "results": results }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bing_search_results() {
        let html = r#"<li class="b_algo" data-id="1"><h2><a href="https://example.com/page?a=1&amp;b=2">Example <strong>Title</strong></a></h2><div class="b_caption"><p>Hello &amp; <b>world</b>.</p></div></li><li class="b_algo" data-id="2"><h2><a href="https://example.com/other">Other</a></h2><p>Second result</p></li>"#;
        let results = parse_bing_search_results(html, 5);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].title, "Example Title");
        assert_eq!(results[0].url, "https://example.com/page?a=1&b=2");
        assert_eq!(results[0].snippet, "Hello & world.");
        assert_eq!(results[1].title, "Other");
    }
}
