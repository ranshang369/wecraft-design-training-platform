import { describe, expect, it } from "vitest";
import {
  caseMetadataIssues,
  structureSignatureIssues,
  visualGrammarIssues,
} from "../../src/lib/case-metadata";

const grammar = {
  surfaceMaterial: "暖色旧纸、胶带和回形针共同承担照片层与正文层的关系。",
  typeSystem: "超大英文显示字、宋体正文和手写图注形成三层职责。",
  imageTreatment: "首图满幅出血，路线节点用窄幅拍立得和胶带错位照片；图注像手写便签。",
  composition: "首屏先给路线与双联照片，后文在窄栏、宽图和小票事实带之间切换。",
  colorLight: "纸色承托墨色，红色路线和印章只承担路径与确认状态。",
  decorationAnnotations: "胶带、回形针、编号和图章都对应行李或行程信息。",
  firstScreenAction: "两张错位拍立得压住手绘路线，标题从路线中间穿过。",
};

describe("case metadata quality gate", () => {
  it("accepts a grammar with concrete image relations and a comparable structure", () => {
    expect(visualGrammarIssues(grammar)).toEqual([]);
    expect(caseMetadataIssues({
      visualGrammar: grammar,
      structureSignature: "route-entry > wide-landscape > polaroid-sequence > ticket-facts > human-close",
      bodyMechanism: "首屏以路线建立行程，后文用每站的照片、事实带与手写注记反复兑现同一条移动路径。",
    })).toEqual([]);
  });

  it("rejects a generic image description that cannot guide another design", () => {
    expect(visualGrammarIssues({ ...grammar, imageTreatment: "图片放在正文里，尺寸合适。" }))
      .toContain("图像处理必须写明至少两种图幅、裁切、边框或图注关系");
    expect(visualGrammarIssues({ ...grammar, imageTreatment: "照片有边框和阴影，整体高级克制。" }))
      .toContain("图像处理必须写明至少两种图幅、裁切、边框或图注关系");
  });

  it("accepts two genuinely different image roles even within the same axis", () => {
    expect(visualGrammarIssues({
      ...grammar,
      imageTreatment: "首图满幅出血，第二章改用 72% 窄幅图版；两者都保留真实照片，不做统一圆角。",
    })).toEqual([]);
  });

  it("requires an explicit substitute when the case has no photographic assets", () => {
    expect(visualGrammarIssues({ ...grammar, imageTreatment: "无摄影资产，正文照常排版。" }))
      .toContain("无图案例必须说明用什么图形、材料或图版替代摄影");
    expect(visualGrammarIssues({
      ...grammar,
      imageTreatment: "没有真实摄影；用折页图版和单色几何场承担章节停顿。",
    })).toEqual([]);
  });

  it("rejects a structure signature without three comparable steps", () => {
    expect(structureSignatureIssues("大图 > 正文")).not.toEqual([]);
    expect(structureSignatureIssues("wide-entry > body > close")).toEqual([]);
  });
});
