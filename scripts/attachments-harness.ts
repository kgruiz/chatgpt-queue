import {
  applyAttachmentsToComposer,
  collectImagesFromDataTransfer,
  hasImagesInDataTransfer,
} from "../src/lib/attachments";
import { createInitialState } from "../src/lib/state";
import { initComposerController } from "../src/entrypoints/composer-controller";
import { initModelController } from "../src/entrypoints/model-controller";
import { initQueueController } from "../src/entrypoints/queue-controller";
import {
  buildComposerDom,
  ensureModelSwitcherButton,
  sampleGroupMeta,
  sampleModels,
  setupHappyDom,
} from "./harness-env";
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
    [Symbol.iterator]: function () {
      return storage[Symbol.iterator]();
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
    [Symbol.iterator]: function () {
      return items[Symbol.iterator]();
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

  override dispatchEvent(event: Event): boolean {
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

const runComposerAttachmentSend = async (attachments: Attachment[]) => {
  const env = setupHappyDom();
  const composerFixture = buildComposerDom(document);
  ensureModelSwitcherButton(document);

  const state = createInitialState();
  state.models = sampleModels;
  state.modelGroups = sampleGroupMeta;

  const noop = () => {};
  const dispatchPointer = () => true;

  const modelController = initModelController({
    state,
    emitStateChange: noop,
    refreshControls: noop,
    saveState: noop,
    dispatchPointerAndMousePress: dispatchPointer,
    dispatchKeyboardEnterPress: dispatchPointer,
  });

  const queueController = initQueueController({
    state,
    emitStateChange: noop,
    saveState: noop,
    scheduleSaveState: noop,
    modelController,
    pauseShortcutLabel: "Ctrl+Shift+P",
  });

  const composerController = initComposerController({
    state,
    emitStateChange: noop,
    saveState: noop,
    refreshControls: queueController.refreshControls,
    scheduleControlRefresh: queueController.scheduleControlRefresh,
    setPaused: queueController.setPaused,
    labelForModel: modelController.labelForModel,
    supportsThinkingForModel: modelController.supportsThinkingForModel,
    getCurrentModelId: modelController.getCurrentModelId,
    getCurrentModelLabel: modelController.getCurrentModelLabel,
    ensureModel: modelController.ensureModel,
    markModelSelected: modelController.markModelSelected,
    openModelDropdownForAnchor: modelController.openModelDropdownForAnchor,
    modelMenuController: modelController.modelMenuController,
    activateMenuItem: modelController.activateMenuItem,
    dispatchPointerAndMousePress: dispatchPointer,
    queueList: queueController.list,
    applyModelSelectionToEntry: queueController.applyModelSelectionToEntry,
    setEntryThinkingOption: queueController.setEntryThinkingOption,
    resolveQueueEntryThinkingLabel: queueController.resolveQueueEntryThinkingLabel,
    addAttachmentsToEntry: queueController.addAttachmentsToEntry,
  });

  queueController.attachComposerController(composerController);
  queueController.ensureMounted();
  composerController.ensureComposerControls(composerFixture.root);
  composerController.ensureComposerInputListeners(composerFixture.root);

  composerFixture.sendButton.addEventListener("click", () => {
    composerFixture.sendButton.disabled = true;
    setTimeout(() => {
      composerFixture.sendButton.disabled = false;
    }, 10);
  });

  window.addEventListener("message", (event) => {
    if (event.data?.type === "CQ_SET_PROMPT") {
      window.postMessage({ type: "CQ_SET_PROMPT_DONE" }, "*");
    }
  });

  state.queue.push({
    text: "Queued with attachments",
    attachments: attachments.map((attachment) => ({ ...attachment })),
    model: null,
    modelLabel: null,
    thinking: null,
  });

  const sent = await composerController.sendFromQueue(0, { allowWhilePaused: true });
  assert(sent, "composer controller should send queued entry with attachments");

  composerController.dispose();
  queueController.dispose();
  modelController.dispose();
  env.cleanup();
};

async function run() {
  testHasImages();
  const attachments = await testCollectImages();
  await testApplyAttachments(attachments);
  await runComposerAttachmentSend(attachments);
  console.log("attachments harness passed");
}

run().catch((error) => {
  console.error("attachments harness failed", error);
  process.exit(1);
});
