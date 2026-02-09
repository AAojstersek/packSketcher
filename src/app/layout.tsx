import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

type StartupImageSpec = {
  filename: string;
  deviceWidth: number;
  deviceHeight: number;
  ratio: number;
  orientation: "portrait" | "landscape";
};

const STARTUP_IMAGE_VERSION = "v=2";

const startupImageSpecs: StartupImageSpec[] = [
  // iPhone portrait
  { filename: "iphone-440x956@3-portrait.png", deviceWidth: 440, deviceHeight: 956, ratio: 3, orientation: "portrait" },
  { filename: "iphone-430x932@3-portrait.png", deviceWidth: 430, deviceHeight: 932, ratio: 3, orientation: "portrait" },
  { filename: "iphone-428x926@3-portrait.png", deviceWidth: 428, deviceHeight: 926, ratio: 3, orientation: "portrait" },
  { filename: "iphone-402x874@3-portrait.png", deviceWidth: 402, deviceHeight: 874, ratio: 3, orientation: "portrait" },
  { filename: "iphone-393x852@3-portrait.png", deviceWidth: 393, deviceHeight: 852, ratio: 3, orientation: "portrait" },
  { filename: "iphone-390x844@3-portrait.png", deviceWidth: 390, deviceHeight: 844, ratio: 3, orientation: "portrait" },
  { filename: "iphone-375x812@3-portrait.png", deviceWidth: 375, deviceHeight: 812, ratio: 3, orientation: "portrait" },
  { filename: "iphone-375x667@2-portrait.png", deviceWidth: 375, deviceHeight: 667, ratio: 2, orientation: "portrait" },
  // iPad portrait + landscape
  { filename: "ipad-1024x1366@2-portrait.png", deviceWidth: 1024, deviceHeight: 1366, ratio: 2, orientation: "portrait" },
  { filename: "ipad-1366x1024@2-landscape.png", deviceWidth: 1366, deviceHeight: 1024, ratio: 2, orientation: "landscape" },
  { filename: "ipad-834x1194@2-portrait.png", deviceWidth: 834, deviceHeight: 1194, ratio: 2, orientation: "portrait" },
  { filename: "ipad-1194x834@2-landscape.png", deviceWidth: 1194, deviceHeight: 834, ratio: 2, orientation: "landscape" },
  { filename: "ipad-820x1180@2-portrait.png", deviceWidth: 820, deviceHeight: 1180, ratio: 2, orientation: "portrait" },
  { filename: "ipad-1180x820@2-landscape.png", deviceWidth: 1180, deviceHeight: 820, ratio: 2, orientation: "landscape" },
  { filename: "ipad-810x1080@2-portrait.png", deviceWidth: 810, deviceHeight: 1080, ratio: 2, orientation: "portrait" },
  { filename: "ipad-1080x810@2-landscape.png", deviceWidth: 1080, deviceHeight: 810, ratio: 2, orientation: "landscape" },
  { filename: "ipad-768x1024@2-portrait.png", deviceWidth: 768, deviceHeight: 1024, ratio: 2, orientation: "portrait" },
  { filename: "ipad-1024x768@2-landscape.png", deviceWidth: 1024, deviceHeight: 768, ratio: 2, orientation: "landscape" },
  { filename: "ipad-744x1133@2-portrait.png", deviceWidth: 744, deviceHeight: 1133, ratio: 2, orientation: "portrait" },
  { filename: "ipad-1133x744@2-landscape.png", deviceWidth: 1133, deviceHeight: 744, ratio: 2, orientation: "landscape" },
];

const startupImages = startupImageSpecs.map((spec) => ({
  url: `/splash/${spec.filename}?${STARTUP_IMAGE_VERSION}`,
  media:
    `screen and (device-width: ${spec.deviceWidth}px) and (device-height: ${spec.deviceHeight}px) ` +
    `and (-webkit-device-pixel-ratio: ${spec.ratio}) and (orientation: ${spec.orientation})`,
}));

export const metadata: Metadata = {
  title: "PackSketcher",
  description: "Visual planner for organizing boxes, bags and gear",
  applicationName: "PackSketcher",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PackSketcher",
    startupImage: startupImages,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
    apple: [{ url: "/apple-icon", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 text-slate-900`}
      >
        {children}
      </body>
    </html>
  );
}
