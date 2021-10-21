import { Content } from "mdast";
import { paragraph, text } from "mdast-builder";
import { Paragraph } from "mdast-util-from-markdown/lib";
import type { Node } from "unist";

export function callout(type: string, title?: string, children?: Content[]): Paragraph {
    const opener = [
        text(`{{% callout "${type}"`)
    ];
    if (title) {
        opener.push(text(` ${title} `));
    }
    opener.push(text(` %}}\n\n`))

    const content = [...opener];
    if (children) {
        content.push(...children);
    }

    content.push(text("\n\n"));
    content.push(text(`{{% /callout %}}\n\n`));

    const output = paragraph(content) as Paragraph;
    return output;
}

