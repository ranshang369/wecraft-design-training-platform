import sanitizeHtml from "sanitize-html";

export const PREVIEW_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; connect-src 'none'; script-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

export function safeHtml(input: string) {
  let html = sanitizeHtml(input, {
    allowedTags: [
      "html", "head", "body", "title", "meta", "style", "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
      "strong", "em", "b", "i", "u", "s", "small", "br", "hr", "ul", "ol", "li", "blockquote", "pre", "code",
      "figure", "figcaption", "img", "section", "article", "header", "footer", "main", "aside", "table", "thead",
      "tbody", "tr", "th", "td", "picture", "source", "svg", "path", "circle", "rect", "line", "polyline", "polygon", "g",
    ],
    allowedAttributes: {
      "*": ["class", "id", "style", "aria-label", "role"],
      img: ["src", "alt", "width", "height", "loading"],
      svg: ["viewBox", "width", "height", "fill", "stroke", "xmlns", "aria-hidden"],
      path: ["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"],
      circle: ["cx", "cy", "r", "fill", "stroke"],
      rect: ["x", "y", "width", "height", "rx", "fill", "stroke"],
      line: ["x1", "y1", "x2", "y2", "stroke"],
      polyline: ["points", "fill", "stroke"],
      polygon: ["points", "fill", "stroke"],
      g: ["fill", "stroke", "transform"],
      source: ["srcset", "media", "type"],
      meta: ["charset", "name", "content"],
    },
    allowedSchemes: ["data"],
    allowedSchemesByTag: { img: ["data"], source: ["data"] },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      form: "div",
      input: "span",
      button: "span",
      a: "span",
      iframe: "div",
      object: "div",
      embed: "div",
    },
  });
  html = html.replace(/url\((?!['"]?data:)[^)]*\)/gi, "none");
  html = html.replace(/@import[^;]+;/gi, "");
  return html;
}

export function htmlSecurityIssues(input: string): string[] {
  const issues: string[] = [];
  const lower = input.toLowerCase();
  if (/<script\b/i.test(lower)) issues.push("包含 <script>");
  if (/<iframe\b|<object\b|<embed\b/i.test(lower)) issues.push("包含可嵌入外部内容");
  if (/\bon\w+\s*=/i.test(lower)) issues.push("包含事件属性");
  if (/javascript\s*:/i.test(lower)) issues.push("包含 javascript: 协议");
  if (/<form\b|<input\b|<button\b/i.test(lower)) issues.push("包含表单控件");
  if (/https?:\/\//i.test(lower)) issues.push("包含外部网络地址");
  if (/<meta[^>]+http-equiv\s*=\s*["']?refresh/i.test(lower)) issues.push("包含 meta refresh");
  return issues;
}

