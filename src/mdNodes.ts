import {
    DocBlockTag,
    DocCodeSpan,
    DocComment,
    DocErrorText,
    DocEscapedText,
    DocFencedCode,
    DocHtmlEndTag,
    DocHtmlStartTag,
    DocLinkTag,
    DocNode,
    DocNodeKind,
    DocNodeTransforms,
    DocParagraph,
    DocPlainText,
    DocSection
} from "@microsoft/tsdoc";
import chalk from "chalk";
import type { Break, Code, Content, HTML, InlineCode, Link, Paragraph, Text } from "mdast";
import * as md from "mdast-builder";
import { fromMarkdown } from "mdast-util-from-markdown";

export function callout(type: string, title?: string, children?: Content[]): Paragraph {
    const opener = [
        md.text(`{{% callout "${type}"`)
    ];
    if (title) {
        opener.push(md.text(` ${title} `));
    }
    opener.push(md.text(` %}}\n\n`))

    const content = [...opener];
    if (children) {
        content.push(...children);
    }

    content.push(md.text("\n\n"));
    content.push(md.text(`{{% /callout %}}\n\n`));

    const output = md.paragraph(content) as Paragraph;
    return output;
}

export function docNodesToMdast(nodes: readonly DocNode[]): Content[] {
    const res = nodes
        // .filter(n=>docNodeToMdast(n) !== undefined)
        .flatMap((n) => {
            const mdast = docNodeToMdast(n);
            if (mdast !== undefined) {
                return mdast;
            }
            else return [] as Content[];
        });
    return res;
}

export function docNodeToMdast(docNode: DocNode): Content[] | undefined {
    // console.log(chalk.greenBright(docNode.kind));
    // console.log(chalk.greenBright(docNode));

    switch (docNode.kind) {
        case DocNodeKind.Block:
        case DocNodeKind.BlockTag:
            const tagNode: DocBlockTag = docNode as DocBlockTag;
            console.warn(chalk.yellow(`Unsupported block tag: ${tagNode.tagName}`));
            break;
        case DocNodeKind.CodeSpan:
            const code = docNode as DocCodeSpan;
            return [md.inlineCode(code.code) as InlineCode];
        case DocNodeKind.Comment:
            const comment = docNode as DocComment;
            break;
        case DocNodeKind.ErrorText:
            const docErrorText = docNode as DocErrorText;
            return [md.text(docErrorText.text) as Text];
        case DocNodeKind.EscapedText:
            const docEscapedText = docNode as DocEscapedText;
            return [md.text(docEscapedText.decodedText) as Text];
        case DocNodeKind.FencedCode:
            const docFencedCode = docNode as DocFencedCode;
            return [md.code(docFencedCode.language, docFencedCode.code) as Code];
        case DocNodeKind.HtmlStartTag:
        case DocNodeKind.HtmlEndTag:
            const docHtmlTag = docNode as DocHtmlStartTag | DocHtmlEndTag;
            return [md.html(docHtmlTag.emitAsHtml()) as HTML];
        case DocNodeKind.InlineTag:
            break;
        case DocNodeKind.LinkTag:
            const docLinkTag = docNode as DocLinkTag;
            if (docLinkTag.codeDestination) {
                throw new Error("writeLinkTagWithCodeDestination()");
            } else if (docLinkTag.urlDestination) {
                const linkText: string =
                    docLinkTag.linkText !== undefined ? docLinkTag.linkText : docLinkTag.urlDestination;
                return [md.link(docLinkTag.urlDestination, undefined, md.text(linkText)) as Link];
            } else if (docLinkTag.linkText) {
                return [md.text(docLinkTag.linkText) as Text];
            }
        case DocNodeKind.Paragraph:
            const docParagraph = docNode as DocParagraph;
            const trimmedParagraph = DocNodeTransforms.trimSpacesInParagraph(docParagraph);
            const children: Content[] = docNodesToMdast(trimmedParagraph.nodes);
            return [md.paragraph(children) as Paragraph];
        case DocNodeKind.PlainText:
            // return [md.text((docNode as DocPlainText).text) as Text];
            return plainTextToMdast(docNode as DocPlainText);
        case DocNodeKind.Section:
            const docSection: DocSection = docNode as DocSection;
            const sectionChildren: Content[] = docNodesToMdast(docSection.nodes);
            return [md.paragraph(sectionChildren) as Paragraph];
        case DocNodeKind.SoftBreak:
            return [md.brk as Break];
        default:
            throw new Error(`Unsupported DocNodeKind kind: ${docNode.kind}`);
    }
}

function plainTextToMdast(docNode: DocPlainText): Content[] {
    // const content:Content[] = [];
    const docPlainText = docNode as DocPlainText;
    // console.log(chalk.bgBlue(docPlainText.text));
    const toReturn = fromMarkdown(docPlainText.text);
    return toReturn.children;
}
