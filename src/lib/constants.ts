export const DIMENSIONS = [
  { code: "CONTENT_FIT", label: "内容适配" },
  { code: "VISUAL_MECHANISM", label: "视觉机制" },
  { code: "TYPE_HIERARCHY", label: "字形层级" },
  { code: "IMAGE_NARRATIVE", label: "图像叙事" },
  { code: "RHYTHM", label: "节奏变化" },
  { code: "COMPLETION", label: "整体完成度" },
] as const;

export const ARCHETYPES = [
  { code: "SELF_REFERENTIAL", label: "自我指涉" },
  { code: "MATERIAL", label: "材料语言" },
  { code: "SCENE", label: "场景叙事" },
  { code: "GENRE", label: "类型借用" },
  { code: "SCHEMA", label: "图式结构" },
  { code: "INTERFACE", label: "界面语言" },
  { code: "CITATION", label: "引用与拼贴" },
  { code: "PSYCHOLOGICAL", label: "心理感知" },
  { code: "PROCESS", label: "过程留痕" },
] as const;

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "项目负责人",
  ADMIN: "平台管理员",
  DESIGN_LEAD: "设计负责人",
  CONTENT_LEAD: "内容负责人",
  EDITOR: "内容/编辑",
  ANNOTATOR: "标注/QA",
  AI_ENGINEER: "AI 工程",
  VIEWER: "只读观察者",
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  READY: "就绪",
  SUBMITTED: "已提交",
  IN_REVIEW: "评审中",
  ARBITRATION: "待裁决",
  CHANGES_REQUESTED: "需修改",
  ELIGIBLE: "已具备入库资格",
  APPROVED: "已批准",
  REJECTED: "已拒绝",
  QUARANTINED: "已隔离",
  ARCHIVED: "已归档",
  PENDING: "待处理",
  ASSIGNED: "已分配",
  IN_PROGRESS: "进行中",
  DECLINED: "已拒绝任务",
  EXPIRED: "已过期",
  CANCELLED: "已取消",
  HARD_CHECKING: "硬检查中",
  HARD_CHECK_FAILED: "硬检查失败",
  READY_FOR_BLIND: "可进入盲测",
  IN_BLIND: "盲测中",
  COMPLETED: "已完成",
  WITHDRAWN: "已撤回",
  DISQUALIFIED: "已取消资格",
  VALIDATING: "校验中",
  BLOCKED: "已阻断",
  READY_FOR_APPROVAL: "待批准",
  EXPORTING: "导出中",
  FAILED: "失败",
  REVOKED: "已撤销",
  DEV: "研发集",
  HOLDOUT: "保留集",
  CASE_SOURCE: "案例来源",
  GOLDEN_EVAL: "黄金评测",
  BOTH: "案例 + 评测",
};

export const DIMENSION_CODES = DIMENSIONS.map((d) => d.code);

