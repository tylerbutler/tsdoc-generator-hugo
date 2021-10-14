import { Content } from "mdast";
import { paragraph, text } from "mdast-builder";
import type { Node } from "unist";
export function callout(type: string, title?: string, children?: Content[]): Node {
    const opener = [
        text(`{{% callout "${type}"`)
    ];
    if (title) {
        opener.push(text(` ${title} `));
    }
    opener.push(text(` %}}`))

    const content = [...opener];
    if (children) {
        content.push(...children);
    }

    content.push(text(`{{% /callout %}}`));

    const output = paragraph(content)
    return output;
}

