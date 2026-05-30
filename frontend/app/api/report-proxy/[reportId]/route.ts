import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { reportId: string } }
) {
  const cookieStore = cookies();
  const token = req.nextUrl.searchParams.get("token")
    || cookieStore.get("access_token")?.value;

  if (!token) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const backendUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/reports/view/${params.reportId}?token=${token}`;

  try {
    const res = await fetch(backendUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      return new NextResponse("Not found", { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "application/pdf";
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch {
    return new NextResponse("Error fetching file", { status: 500 });
  }
}