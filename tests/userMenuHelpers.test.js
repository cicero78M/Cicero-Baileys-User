import { formatUpdateSuccess, formatUserReport, getFieldInfo } from "../src/handler/menu/userMenuHelpers.js";

describe("userMenuHelpers social handle formatting", () => {
  it("formats Instagram and TikTok consistently in user report", () => {
    const report = formatUserReport({
      client_name: "POLRES TEST",
      nama: "BUDI",
      title: "AKP",
      user_id: "12345",
      divisi: "BINMAS",
      jabatan: "KASAT",
      insta: "@insta.user",
      tiktok: "@@tik.tok",
      status: true,
    });

    expect(report).toContain("*Instagram*: @insta.user");
    expect(report).toContain("*TikTok*   : @@tik.tok");
  });

  it("shows dash for empty Instagram and TikTok", () => {
    const report = formatUserReport({
      client_name: "POLRES TEST",
      user_id: "12345",
      status: false,
      insta: "",
      tiktok: null,
    });

    expect(report).toContain("*Instagram*: -");
    expect(report).toContain("*TikTok*   : -");
  });

  it("returns consistent social display value from getFieldInfo", () => {
    const insta = getFieldInfo("insta", { insta: "@example.ig" });
    const tiktok = getFieldInfo("tiktok", { tiktok: "example.tt" });

    expect(insta).toEqual({ displayName: "Instagram", value: "@example.ig" });
    expect(tiktok).toEqual({ displayName: "TikTok", value: "@example.tt" });
  });

  it("keeps update success message display value as provided", () => {
    const message = formatUpdateSuccess("TikTok", "@example.tt", "12345");

    expect(message).toContain("*TikTok*");
    expect(message).toContain("berhasil diupdate menjadi *@example.tt*.");
  });
});
