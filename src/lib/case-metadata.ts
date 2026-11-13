export const START_POINT_IDS = [
  "announcement",
  "perspective",
  "story",
  "collection",
  "tutorial",
  "data-brief",
  "invitation",
] as const;

export type StartPointId = (typeof START_POINT_IDS)[number];

export const START_POINTS: ReadonlyArray<{
  id: StartPointId;
  label: string;
  description: string;
}> = [
  { id: "announcement", label: "公告栏", description: "让人一眼知道发生了什么、何时何地、下一步做什么。" },
  { id: "perspective", label: "观点长文", description: "先立判断，再用论据、反例和节奏推进论证。" },
  { id: "story", label: "人物故事", description: "用人物、地点和关键细节带读者走完一段经历。" },
  { id: "collection", label: "清单合集", description: "把多个条目整理成可扫描、可比较、可带走的选择。" },
  { id: "tutorial", label: "步骤教程", description: "按前置条件、动作、结果和故障处理完成一件事。" },
  { id: "data-brief", label: "数据简报", description: "先给结论，再用指标、对比和趋势支撑判断。" },
  { id: "invitation", label: "互动邀请", description: "把参与理由、规则和行动路径变成阅读路径。" },
];

export const INTENT_TAG_IDS = [
  "restrained",
  "striking",
  "editorial",
  "documentary",
  "data-led",
  "playful",
  "warm",
  "interactive",
] as const;

export type IntentTagId = (typeof INTENT_TAG_IDS)[number];

export const INTENT_TAGS: ReadonlyArray<{
  id: IntentTagId;
  label: string;
}> = [
  { id: "restrained", label: "克制留白" },
  { id: "striking", label: "强视觉" },
  { id: "editorial", label: "杂志感" },
  { id: "documentary", label: "纪实感" },
  { id: "data-led", label: "数据图示" },
  { id: "playful", label: "轻松有趣" },
  { id: "warm", label: "温暖手作" },
  { id: "interactive", label: "可操作" },
];

export const VISUAL_GRAMMAR_FIELDS = [
  {
    key: "surfaceMaterial",
    label: "表面材料",
    hint: "纸张、新闻纸、玻璃、金属、布料、舞台黑场、档案夹等；说明材料如何参与层级，而不只是背景色。",
  },
  {
    key: "typeSystem",
    label: "字体制度",
    hint: "显示字、正文字、图注/微字三层分别是什么；字号、字重、字距或方向如何分工。",
  },
  {
    key: "imageTreatment",
    label: "图像处理",
    hint: "满幅、出血、窄条、胶片格、错位双联、相纸、扫描件、遮罩等；说明至少两种图像职责。",
  },
  {
    key: "composition",
    label: "构图关系",
    hint: "首屏、章节宽度、密度、图文关系和转折如何变化；不要只写“左图右文”。",
  },
  {
    key: "colorLight",
    label: "色彩与光",
    hint: "主色职责、明暗关系、光源、阴影、高光和对比；说明色彩不是只换主色。",
  },
  {
    key: "decorationAnnotations",
    label: "装饰与标注",
    hint: "线条、印章、编号、路线、票据、图注和微字各承担什么信息，哪些地方刻意留空。",
  },
  {
    key: "firstScreenAction",
    label: "首屏独立动作",
    hint: "首屏除了“眉题 + 大标题 + 导语”之外，具体做了什么与众不同的构图动作。",
  },
] as const;

export type VisualGrammarKey = (typeof VISUAL_GRAMMAR_FIELDS)[number]["key"];
export type VisualGrammar = Record<VisualGrammarKey, string>;

const NO_IMAGE_TREATMENT = /无摄影|没有.{0,6}(?:摄影|照片|图像)|无图|纯图形|不依赖.{0,8}(?:照片|摄影|图像)/;
const GRAPHIC_SUBSTITUTE = /单色几何场|几何场|几何块|图形图版|折页图版|纹理场|纯文字|排版替身/;
const IMAGE_TREATMENT_MODES: ReadonlyArray<{
  axis: string;
  patterns: ReadonlyArray<{ id: string; pattern: RegExp }>;
}> = [
  {
    axis: "extent",
    patterns: [
      { id: "bleed", pattern: /满幅|通栏|出血/ },
      { id: "narrow", pattern: /窄幅|窄条|半幅|微缩|小幅|竖条/ },
      { id: "offset", pattern: /跨栏|偏置/ },
    ],
  },
  {
    axis: "crop",
    patterns: [{ id: "crop", pattern: /裁切|遮罩|蒙版|局部取景/ }],
  },
  {
    axis: "frame",
    patterns: [
      { id: "photo-paper", pattern: /相纸|宝丽来|拍立得|白边/ },
      { id: "evidence", pattern: /证物|档案框|打孔|回形针|胶带/ },
      { id: "border", pattern: /边框|框线/ },
    ],
  },
  {
    axis: "sequence",
    patterns: [{ id: "sequence", pattern: /胶片格|双联|三联|照片序列/ }],
  },
  {
    axis: "effect",
    patterns: [{ id: "effect", pattern: /半透明|叠影|错位|叠压|混合模式|滤镜|反光/ }],
  },
  {
    axis: "caption",
    patterns: [{ id: "caption", pattern: /图注|手写便签|手写批注|批注|图说/ }],
  },
];

function imageTreatmentModes(text: string): Set<string> {
  const modes = new Set<string>();
  for (const axis of IMAGE_TREATMENT_MODES) {
    for (const mode of axis.patterns) {
      if (mode.pattern.test(text)) modes.add(`${axis.axis}:${mode.id}`);
    }
  }
  return modes;
}

function imageTreatmentIssues(text: string): string | null {
  if (NO_IMAGE_TREATMENT.test(text)) {
    return GRAPHIC_SUBSTITUTE.test(text)
      ? null
      : "无图案例必须说明用什么图形、材料或图版替代摄影";
  }
  return imageTreatmentModes(text).size >= 2
    ? null
    : "图像处理必须写明至少两种图幅、裁切、边框或图注关系";
}

export type InternalArchetype =
  | "SELF_REFERENTIAL"
  | "MATERIAL"
  | "SCENE"
  | "GENRE"
  | "SCHEMA"
  | "INTERFACE"
  | "CITATION"
  | "PSYCHOLOGICAL"
  | "PROCESS";

const START_POINT_ARCHETYPE: Record<StartPointId, InternalArchetype> = {
  announcement: "GENRE",
  perspective: "SELF_REFERENTIAL",
  story: "SCENE",
  collection: "MATERIAL",
  tutorial: "PROCESS",
  "data-brief": "SCHEMA",
  invitation: "CITATION",
};

export function isStartPointId(value: string): value is StartPointId {
  return (START_POINT_IDS as readonly string[]).includes(value);
}

export function isIntentTagId(value: string): value is IntentTagId {
  return (INTENT_TAG_IDS as readonly string[]).includes(value);
}

export function startPointLabels(ids: readonly string[] | null | undefined): string[] {
  return (ids ?? [])
    .filter(isStartPointId)
    .map((id) => START_POINTS.find((item) => item.id === id)?.label ?? id);
}

export function inferInternalArchetype(startPoints: readonly string[] | null | undefined): InternalArchetype {
  const first = (startPoints ?? []).find(isStartPointId);
  return first ? START_POINT_ARCHETYPE[first] : "MATERIAL";
}

export function visualGrammarIssues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["缺少七项视觉语法"];
  const record = value as Record<string, unknown>;
  const allowed = new Set<string>(VISUAL_GRAMMAR_FIELDS.map((field) => field.key));
  const issues: string[] = [];
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) issues.push(`视觉语法含未知字段 ${key}`);
  }
  for (const field of VISUAL_GRAMMAR_FIELDS) {
    const raw = record[field.key];
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) issues.push(`视觉语法缺少 ${field.label}`);
    else if (text.length > 600) issues.push(`视觉语法 ${field.label} 超过 600 字`);
    else if (field.key === "imageTreatment") {
      const imageIssue = imageTreatmentIssues(text);
      if (imageIssue) issues.push(imageIssue);
    }
  }
  return issues;
}

export function structureSignatureIssues(value: unknown): string[] {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return ["缺少结构签名"];
  if (text.length > 1_000) return ["结构签名超过 1,000 字"];
  const steps = text.split(/\s*(?:>|→|\||｜|\/)\s*/).filter(Boolean);
  if (steps.length < 3) return ["结构签名至少要用三个可比较的阅读步骤描述"];
  return [];
}

export function caseMetadataIssues(input: {
  visualGrammar?: unknown;
  structureSignature?: unknown;
  bodyMechanism?: unknown;
}): string[] {
  const issues = visualGrammarIssues(input.visualGrammar);
  issues.push(...structureSignatureIssues(input.structureSignature));
  const bodyMechanism = typeof input.bodyMechanism === "string" ? input.bodyMechanism.trim() : "";
  if (bodyMechanism.length < 24) {
    issues.push("正文承接机制至少需要说明首屏之后章节如何继续展开");
  }
  return issues;
}

export function normalizeVisualGrammar(value: unknown): VisualGrammar | null {
  if (visualGrammarIssues(value).length) return null;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    VISUAL_GRAMMAR_FIELDS.map((field) => [field.key, String(record[field.key]).trim()]),
  ) as VisualGrammar;
}
