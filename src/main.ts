import { Plugin, MarkdownPostProcessorContext, TFile } from "obsidian";
import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import matter from "gray-matter";

interface DisplayPropertiesSettings {
  mySetting: string;
}

const DEFAULT_SETTINGS: DisplayPropertiesSettings = {
  mySetting: "default",
};

export default class DisplayProperties extends Plugin {
  settings: DisplayPropertiesSettings;

  async onload() {
    // Read mode
    this.registerMarkdownPostProcessor(async (element, context) => {
      await this.replacePropertyReferences(element, context);
    });

    // Editor mode
    this.registerEditorExtension(propertyReferenceViewPlugin(this.app));
  }

  async replacePropertyReferences(
    element: HTMLElement,
    context: MarkdownPostProcessorContext
  ) {
    const file = this.app.vault.getAbstractFileByPath(context.sourcePath);
    if (!(file instanceof TFile)) return;
    const content = await this.app.vault.read(file);
    const frontMatter = extractFrontMatter(content);

    element.querySelectorAll("*").forEach((node) => {
      if (
        node.childNodes.length === 1 &&
        node.childNodes[0].nodeType === Node.TEXT_NODE
      ) {
        let text = node.textContent || "";
        text = text.replace(/{{([\w\-]+)}}/g, (match, propName) => {
          return frontMatter[propName] || match;
        });
        node.textContent = text;
      }
    });
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

function extractFrontMatter(content: string): Record<string, string> {
  try {
    const { data } = matter(content);
    return data || {};
  } catch (e) {
    return {};
  }
}

function propertyReferenceViewPlugin(app: any) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.createDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.createDecorations(update.view);
        }
      }

      createDecorations(view: EditorView): DecorationSet {
        const file = app.workspace.getActiveFile();
        if (!file) return Decoration.none;

        let decorations: any[] = [];
        const content = view.state.doc.toString();
        const frontMatter = extractFrontMatter(content);
        const regex = /{{([\w\-]+)}}/g;

        for (let { from, to } of view.visibleRanges) {
          regex.lastIndex = 0;
          let text = view.state.sliceDoc(from, to);
          let match;
          while ((match = regex.exec(text)) !== null) {
            const start = from + match.index;
            const end = start + match[0].length;
            const value = frontMatter[match[1]];
            if (value !== undefined) {
              decorations.push(
                Decoration.replace({
                  widget: new InlineWidget(value),
                }).range(start, end)
              );
            }
          }
        }

        return Decoration.set(decorations, true);
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

class InlineWidget extends WidgetType {
  value: string;
  constructor(value: string) {
    super();
    this.value = value;
  }

  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.value;
    return span;
  }

  eq(other: InlineWidget) {
    return this.value === other.value;
  }
}
