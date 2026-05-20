/// <reference types="vite/client" />

// Minimal WebHID type shims (Chrome/Edge). Wrapped in `declare global` so they
// remain ambient even with `moduleDetection: "force"`.
export {};

declare global {
  interface HIDDeviceFilter {
    vendorId?: number;
    productId?: number;
    usagePage?: number;
    usage?: number;
  }

  interface HIDDeviceRequestOptions {
    filters: HIDDeviceFilter[];
  }

  interface HIDInputReportEvent extends Event {
    device: HIDDevice;
    reportId: number;
    data: DataView;
  }

  interface HIDConnectionEvent extends Event {
    device: HIDDevice;
  }

  interface HIDDevice extends EventTarget {
    readonly opened: boolean;
    readonly vendorId: number;
    readonly productId: number;
    readonly productName: string;
    oninputreport: ((this: HIDDevice, ev: HIDInputReportEvent) => unknown) | null;
    open(): Promise<void>;
    close(): Promise<void>;
    sendReport(reportId: number, data: BufferSource): Promise<void>;
  }

  interface HID extends EventTarget {
    requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
    getDevices(): Promise<HIDDevice[]>;
    addEventListener(
      type: "connect" | "disconnect",
      listener: (this: HID, ev: HIDConnectionEvent) => unknown,
    ): void;
    removeEventListener(
      type: "connect" | "disconnect",
      listener: (this: HID, ev: HIDConnectionEvent) => unknown,
    ): void;
  }

  interface Navigator {
    hid: HID;
  }
}
