const SVG_NS = "http://www.w3.org/2000/svg";
export type TemplateChild =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | TemplateChild[];

export interface TemplateProps<T extends Element = Element> {
  className?: string | string[];
  classes?: Array<string | false | null | undefined>;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  dataset?: Record<string, string | null | undefined>;
  text?: string | number | null;
  html?: string | null;
  ref?: (element: T) => void;
}

const toArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
};

const tokenizeClassNames = (value: string | string[]): string[] => {
  return toArray(value)
    .flatMap((token) => String(token || "").split(/\s+/))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
};

const assignClasses = (element: Element, props?: TemplateProps) => {
  if (!props) return;
  const tokens = [
    ...tokenizeClassNames(props.className || []),
    ...toArray(props.classes || [])
      .map((token) => (token ? token.trim() : ""))
      .filter((token) => token.length > 0),
  ];
  if (tokens.length) {
    element.classList.add(...tokens);
  }
};

const assignAttributes = (element: Element, props?: TemplateProps) => {
  if (!props?.attrs) return;
  Object.entries(props.attrs).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === "boolean") {
      if (value) element.setAttribute(key, "");
      return;
    }
    element.setAttribute(key, String(value));
  });
};

const assignDataset = (element: HTMLElement | SVGElement, props?: TemplateProps) => {
  if (!props?.dataset || !(element instanceof HTMLElement)) return;
  Object.entries(props.dataset).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    element.dataset[key] = value;
  });
};

const appendChildren = (node: Node, children: TemplateChild[]) => {
  const queue: TemplateChild[] = [...children];
  while (queue.length) {
    const child = queue.shift();
    if (child === undefined || child === null || child === false) continue;
    if (Array.isArray(child)) {
      queue.unshift(...child);
      continue;
    }
    if (typeof child === "string" || typeof child === "number") {
      node.appendChild(document.createTextNode(String(child)));
      continue;
    }
    if (child instanceof Node) {
      node.appendChild(child);
    }
  }
};

const assignContent = (element: Element, props?: TemplateProps) => {
  if (!props) return;
  if (typeof props.html === "string") {
    element.innerHTML = props.html;
    return;
  }
  if (
    typeof props.text === "string" ||
    typeof props.text === "number"
  ) {
    element.textContent = String(props.text);
  }
};

export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: TemplateProps<HTMLElementTagNameMap[K]>,
  ...children: TemplateChild[]
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  assignClasses(element, props);
  assignAttributes(element, props);
  assignDataset(element, props);
  assignContent(element, props);
  appendChildren(element, children);
  props?.ref?.(element);
  return element;
};

export const svg = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  props?: TemplateProps<SVGElementTagNameMap[K]>,
  ...children: TemplateChild[]
): SVGElementTagNameMap[K] => {
  const element = document.createElementNS(SVG_NS, tag);
  assignClasses(element, props);
  assignAttributes(element, props);
  assignContent(element, props);
  appendChildren(element, children);
  props?.ref?.(element);
  return element;
};

export const fragment = (...children: TemplateChild[]): DocumentFragment => {
  const frag = document.createDocumentFragment();
  appendChildren(frag, children);
  return frag;
};
