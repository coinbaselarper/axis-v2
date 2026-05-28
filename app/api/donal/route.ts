import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(req: NextRequest) {
  try {
    const filePath = path.join(process.cwd(),"app/api/donal/donal.jpg");

    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 502 }
    );
  }
}