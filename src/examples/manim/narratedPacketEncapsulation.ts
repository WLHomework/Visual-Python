import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, list, number, play, point, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 34) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const packetPart = (label: string, width: number, x: number, color: string) => ({
  type: "visual_python_manim_group_from_list_object",
  inputs: {
    OBJECTS: list(
      moveTo({
        type: "visual_python_manim_set_fill",
        fields: { COLOR: color },
        inputs: {
          MOBJECT: input({
            type: "visual_python_manim_rectangle_object",
            fields: { COLOR: color },
            inputs: { WIDTH: number(width), HEIGHT: number(1.35) },
          }),
          OPACITY: number(0.5),
        },
      }, x, 0),
      mathLabel(label, x, 0, "WHITE", 30),
    ),
  },
});

const group = (...objects: object[]) => ({
  type: "visual_python_manim_group_from_list_object",
  inputs: { OBJECTS: list(...objects) },
});

const data = (x: number) => packetPart("\\text{DATA}", 3, x, "BLUE");
const tcp = (x: number) => packetPart("\\text{TCP}", 1.4, x, "GREEN");
const ip = (x: number) => packetPart("\\text{IP}", 1.4, x, "YELLOW");
const ethernet = (x: number) => packetPart("\\text{ETH}", 1.5, x, "RED");

const transform = (source: string, target: string, seconds = 1) => play({
  type: "visual_python_manim_transform_to_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) },
});

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedPacketEncapsulationExample: ExampleProject = {
  id: "manim-narrated-packet-encapsulation",
  title: "计算机网络：数据包分层封装",
  projectName: "narrated-packet-encapsulation.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedPacketEncapsulation", "Scene", chain(
    assign("application_data", data(0)),
    assign("transport_segment", group(tcp(-1.5), data(0.7))),
    assign("network_packet", group(ip(-2.2), tcp(-0.8), data(1.4))),
    assign("link_frame", group(ethernet(-2.9), ip(-1.45), tcp(-0.05), data(2.15))),
    assign("received_data", data(4.5)),
    assign("application_label", mathLabel("\\text{Application data}", 0, 2.5, "BLUE", 38)),
    assign("transport_label", mathLabel("\\text{Transport segment}", 0, 2.5, "GREEN", 38)),
    assign("network_label", mathLabel("\\text{Network packet}", 0, 2.5, "YELLOW", 38)),
    assign("link_label", mathLabel("\\text{Link frame}", 0, 2.5, "RED", 38)),
    assign("tcp_note", mathLabel("\\text{ports, sequence}", -3.7, -2, "GREEN", 30)),
    assign("ip_note", mathLabel("\\text{source and destination IP}", 0, -2, "YELLOW", 30)),
    assign("eth_note", mathLabel("\\text{MAC and frame check}", 3.7, -2, "RED", 30)),
    assign("receiver_label", mathLabel("\\text{Receiver}", 4.5, 2.5, "GREEN", 38)),
    assign("direction", {
      type: "visual_python_manim_arrow_object",
      fields: { COLOR: "WHITE" },
      inputs: { START: input(point(-5.2, 3.25)), END: input(point(5.2, 3.25)), BUFF: number(0) },
    }),
    voiceoverWithAnimation("应用程序先产生原始数据。此时它还没有网络地址、端口或链路信息。", chain(play(create("direction", 0.7)), play(create("application_data", 0.7)), write("application_label", 0.6)), "default", "packet-application"),
    voiceoverWithAnimation("数据交给传输层后，前面加入 TCP 头部，其中包含端口、序号等信息，数据变成传输层报文段。", chain(transform("application_data", "transport_segment", 1.1), transform("application_label", "transport_label", 0.6), write("tcp_note", 0.5)), "default", "packet-transport"),
    voiceoverWithAnimation("继续交给网络层，IP 头部被加入最前方，用来记录源地址、目标地址以及路由所需信息。", chain(transform("application_data", "network_packet", 1.1), transform("application_label", "network_label", 0.6), write("ip_note", 0.5)), "default", "packet-network"),
    voiceoverWithAnimation("到达链路层后，再加入以太网头部，最终形成可以在当前链路上传输的完整帧。", chain(transform("application_data", "link_frame", 1.1), transform("application_label", "link_label", 0.6), write("eth_note", 0.5)), "default", "packet-link"),
    voiceoverWithAnimation("接收端按照相反顺序处理：先去掉链路层信息，再去掉 IP 和 TCP 头部，最后把原始数据交给应用程序。", chain(transform("application_data", "received_data", 1.4), transform("application_label", "receiver_label", 0.7)), "default", "packet-decapsulation"),
    voiceover("分层封装让每一层只负责自己的任务。不同网络技术可以替换底层实现，而应用数据不需要了解传输细节。", "default", "packet-summary"),
    wait(0.8),
  )),
};
