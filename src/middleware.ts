import { NextResponse, type NextRequest } from "next/server";

function safeEqual(left: string, right: string) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= left.charCodeAt(index % Math.max(left.length, 1)) ^ right.charCodeAt(index % Math.max(right.length, 1));
  }
  return difference === 0;
}

export function middleware(request: NextRequest) {
  const expected = process.env.SITE_ACCESS_PASSWORD;
  if (!expected) return NextResponse.next();

  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = authorization.split(" ");
  if (scheme?.toLowerCase() === "basic" && encoded) {
    try {
      const decoded = atob(encoded);
      const separator = decoded.indexOf(":");
      if (separator >= 0 && safeEqual(decoded.slice(separator + 1), expected)) {
        return NextResponse.next();
      }
    } catch {
      // Fall through to the access challenge.
    }
  }

  return new NextResponse("需要输入站点访问口令。", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="WeCraft Design Training", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const config = {
  matcher: ["/((?!api/v1/health).*)"],
};
