import {
  applyAttachmentsToComposer,
  collectImagesFromDataTransfer,
  hasImagesInDataTransfer,
} from "../src/lib/attachments";
import type { Attachment } from "../src/lib/types";

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const createFileList = (storage: File[]): FileList => {
  const list: Partial<FileList> = {
    get length() {
      return storage.length;
    },
    item: (index: number) => storage[index] || null,
    [Symbol.iterator]: function* () {
      yield* storage;
    },
  };
  return list as FileList;
};

const createItem = (file: File): DataTransferItem => ({
  kind: "file",
  type: file.type,
  getAsFile: () => file,
  getAsString: () => null,
  webkitGetAsEntry: () => null,
}) as DataTransferItem;

const createItemList = (storage: File[]): DataTransferItemList => {
  const items: DataTransferItem[] = storage.map((file) => createItem(file));
  const list: Partial<DataTransferItemList> = {
    get length() {
      return items.length;
    },
    add: (data: string | File) => {
      if (typeof data === "string") return null;
      storage.push(data);
      const item = createItem(data);
      items.push(item);
      return item;
    },
    clear: () => {
      storage.length = 0;
      items.length = 0;
    },
    remove: (index: number) => {
      storage.splice(index, 1);
      items.splice(index, 1);
    },
    item: (index: number) => items[index] || null,
    [Symbol.iterator]: function* () {
      yield* items;
    },
  };
  return list as DataTransferItemList;
};

class HarnessDataTransfer implements DataTransfer {
  dropEffect: "none" | "copy" | "link" | "move" = "copy";
  effectAllowed:
    | "none"
    | "copy"
    | "copyLink"
    | "copyMove"
    | "link"
    | "linkMove"
    | "move"
    | "all"
    | "uninitialized" = "all";
  files: FileList;
  items: DataTransferItemList;
  types: ReadonlyArray<string> = [];

  private storage: File[] = [];

  constructor(initialFiles: File[] = []) {
    this.files = createFileList(this.storage);
    this.items = createItemList(this.storage);
    initialFiles.forEach((file) => {
      this.items.add(file);
    });
  }

  getData(): string {
    return "";
  }

  setData(): boolean {
    return false;
  }

  clearData(): void {
    this.storage.length = 0;
    this.items.clear();
  }

  setDragImage(): void {
    // noop for harness
  }
}

(globalThis as Record<string, unknown>).DataTransfer = HarnessDataTransfer;

class FakeButtonElement {
  clickCount = 0;
  click() {
    this.clickCount += 1;
  }
}

class FakeInputElement extends EventTarget {
  files: FileList | null = null;
  changeEvents = 0;

  dispatchEvent(event: Event): boolean {
    const result = super.dispatchEvent(event);
    if (event.type === "change") {
      this.changeEvents += 1;
    }
    return result;
  }
}

class FakeComposerRoot {
  public readonly input = new FakeInputElement();
  public readonly trigger = new FakeButtonElement();

  querySelector(selector: string): HTMLElement | HTMLInputElement | null {
    if (selector.includes("input[type=\"file\"")) {
      return this.input as unknown as HTMLInputElement;
    }
    if (selector.includes("button")) {
      return this.trigger as unknown as HTMLElement;
    }
    return null;
  }

  querySelectorAll(): NodeListOf<Element> {
    return [] as unknown as NodeListOf<Element>;
  }
}

const createSampleFiles = (): File[] => [
  new File([new Uint8Array([1, 2, 3])], "one.png", { type: "image/png" }),
  new File([new Uint8Array([4, 5, 6, 7])], "two.jpg", { type: "image/jpeg" }),
];

const createMixedTransfer = (): DataTransfer => {
  const files = createSampleFiles();
  const transfer = new HarnessDataTransfer(files);
  return transfer as unknown as DataTransfer;
};

const testHasImages = () => {
  const transfer = createMixedTransfer();
  assert(hasImagesInDataTransfer(transfer), "should detect images");

  const textOnly = {
    items: [
      {
        kind: "string",
        type: "text/plain",
        getAsFile: () => null,
        getAsString: (callback: (data: string | null) => void) => callback("text"),
        webkitGetAsEntry: () => null,
      },
    ],
    files: [],
  } as unknown as DataTransfer;
  assert(!hasImagesInDataTransfer(textOnly), "should ignore non-image transfers");
};

const testCollectImages = async (): Promise<Attachment[]> => {
  const transfer = createMixedTransfer();
  const attachments = await collectImagesFromDataTransfer(transfer);
  assert(attachments.length === 2, "should collect two attachments");
  attachments.forEach((attachment) => {
    assert(
      attachment.dataUrl.startsWith("data:image"),
      "attachment should include data url",
    );
  });
  return attachments;
};

const testApplyAttachments = async (attachments: Attachment[]) => {
  const root = new FakeComposerRoot();
  const applied = await applyAttachmentsToComposer(
    root as unknown as HTMLElement,
    attachments,
  );
  assert(applied, "should apply attachments to composer");
  assert(
    (root.input.files?.length || 0) === attachments.length,
    "composer input should have matching file count",
  );
  assert(root.input.changeEvents > 0, "composer input should emit change event");
};

async function run() {
  testHasImages();
  const attachments = await testCollectImages();
  await testApplyAttachments(attachments);
  console.log("attachments harness passed");
}

run().catch((error) => {
  console.error("attachments harness failed", error);
  process.exit(1);
});
