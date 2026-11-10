// Studio/CLI defaults. Final renders go through tools/render.mjs, which sets these explicitly.
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setChromiumOpenGlRenderer("angle"); // GPU WebGL via ANGLE (D3D11 on Windows, Metal on macOS)
Config.setConcurrency(4);
