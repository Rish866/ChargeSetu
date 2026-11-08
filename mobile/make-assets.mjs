// Renders Android icon/splash sources from the ChargeSetu logo (green tile + white bolt).
import sharp from "sharp";
const bolt = (scale, cx, cy) => `<path transform="translate(${cx - 256 * scale} ${cy - 256 * scale}) scale(${scale})" d="M286 64 134 290h104l-22 158 152-226H264z" fill="#fff"/>`;
const svg = (w, h, body, bg) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ""}${body}</svg>`);
const out = "mobile/assets";
await sharp(svg(1024, 1024, bolt(1.6, 512, 512), "#039855")).png().toFile(`${out}/icon-only.png`);
await sharp(svg(1024, 1024, bolt(1.05, 512, 512), null)).png().toFile(`${out}/icon-foreground.png`); // inside the adaptive-icon safe zone
await sharp(svg(1024, 1024, "", "#039855")).png().toFile(`${out}/icon-background.png`);
await sharp(svg(2732, 2732, bolt(1.4, 1366, 1366), "#046c4e")).png().toFile(`${out}/splash.png`);
await sharp(svg(2732, 2732, bolt(1.4, 1366, 1366), "#022c22")).png().toFile(`${out}/splash-dark.png`);
console.log("assets written");
