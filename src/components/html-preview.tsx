export function HtmlPreview({ fileId, title = "HTML 设计预览", height = 600 }: { fileId?: string | null; title?: string; height?: number }) {
  if (!fileId) return <div className="empty" style={{ minHeight: height }}>暂无 HTML 证据</div>;
  return <div className="preview-frame" style={{ height }}>
    <iframe
      title={title}
      src={"/api/v1/files/" + fileId + "/content"}
      sandbox=""
      referrerPolicy="no-referrer"
      loading="lazy"
      style={{ height }}
    />
  </div>;
}
