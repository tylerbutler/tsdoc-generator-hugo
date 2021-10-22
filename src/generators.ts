import {
    ApiClass,
    ApiConstructor,
    ApiDeclaredItem,
    ApiDocumentedItem,
    ApiEnum,
    ApiFunction,
    ApiInterface,
    ApiItem,
    ApiItemKind, ApiNameMixin, ApiPackage, ApiTypeAlias,
    ApiVariable
} from "@microsoft/api-extractor-model";
import chalk from "chalk";
import type { Content, Heading, Paragraph, Root, Table, TableRow, Text } from "mdast";
import * as md from "mdast-builder";
import { getBreadcrumb, getDeprecatedCallout, getNotes, getRemarks, getSignature, getSummary } from "./sections.js";
import { MdOutputPage } from "./types.js";

/**
 * Generates an MDAST tree for an ApiItem.
 *
 * @param item The item to generate MDAST for.
 * @param outputPath
 * @returns A tuple of the MDAST for the current item, and an array of MDAST for any other items that were generated.
 */
export async function GeneratePackageMdast(item: ApiPackage): Promise<[Root, MdOutputPage[]]> {
    if (![ApiItemKind.Package, ApiItemKind.Class].includes(item.kind)) {
        throw new Error(`Expected a Package/Class, got a: ${item.kind}`);
    }

    const tree = md.root() as Root;
    const others: MdOutputPage[] = [];

    const entrypoint = item.members[0];
    console.log(chalk.gray(`Found package entrypoint -- ${entrypoint.members.length} members`));

    const heading = md.heading(1, md.text(item.displayName)) as Heading;
    const [breadcrumb, summary, remarks] = await Promise.all([
        getBreadcrumb(entrypoint),
        getSummary(item),
        getRemarks(item)
    ]);
    tree.children.push(heading, breadcrumb, summary, remarks);

    const classes = entrypoint.members.filter((i): i is ApiClass => i.kind === ApiItemKind.Class);
    const interfaces = entrypoint.members.filter((i): i is ApiInterface => i.kind === ApiItemKind.Interface);
    const typeAliases = entrypoint.members.filter((i): i is ApiTypeAlias => i.kind === ApiItemKind.TypeAlias);
    const variables = entrypoint.members.filter((i): i is ApiVariable => i.kind === ApiItemKind.Variable);
    const functions = entrypoint.members.filter((i): i is ApiFunction => i.kind === ApiItemKind.Function);
    const enums = entrypoint.members.filter((i): i is ApiEnum => i.kind === ApiItemKind.Enum);

    let classMds: Promise<MdOutputPage[]> | undefined;

    // const groups = groupBy(entrypoint.members, item => item.kind);
    // const variables = groups.get(ApiItemKind.Variable)?.map(i => i as ApiVariable);
    // const functions = groups.get(ApiItemKind.Function)?.map(i => i as ApiFunction);
    // const enums = groups.get(ApiItemKind.Enum)?.map(i => i as ApiEnum);

    if (variables && variables.length > 0) {
        tree.children.push(md.heading(2, [md.text("Variables")]) as Heading);
        tree.children.push(await GenerateTable(variables));

        for (const subItem of variables) {
            const section = await GenerateItemSection(subItem, 3);
            tree.children.push(section);
        }
    }

    if (interfaces && interfaces.length > 0) {
        tree.children.push(md.heading(2, [md.text("Interfaces")]) as Heading);
        tree.children.push(await GenerateTable(interfaces));
    }

    if (classes && classes.length > 0) {
        tree.children.push(md.heading(2, [md.text("Classes")]) as Heading);
        tree.children.push(await GenerateTable(classes));

        classMds = Promise.all(classes.map(async (i): Promise<MdOutputPage> => {
            const ast = await GenerateClassMdast(i);
            return {
                mdast: ast,
                item: i,
            }
        }));
    }

    if (typeAliases && typeAliases.length > 0) {
        tree.children.push(md.heading(2, [md.text("Type aliases")]) as Heading);
        tree.children.push(await GenerateTable(typeAliases));

        for (const subItem of typeAliases) {
            const section = await GenerateItemSection(subItem, 3);
            tree.children.push(section);
        }

        typeAliases.forEach(async alias => tree.children.push(await GenerateItemSection(alias, 3)));
    }

    if (enums && enums.length > 0) {
        tree.children.push(md.paragraph([md.heading(2, [md.text("Enums")])]) as Paragraph);
        tree.children.push(await GenerateTable(enums));
    }

    if (functions && functions.length > 0) {
        tree.children.push(md.heading(2, [md.text("Functions")]) as Heading);
        tree.children.push(await GenerateTable(functions));
    }

    // console.log(tree);
    if (classMds) {
        others.push(...await classMds);
    }
    return [tree, others];
}

export async function GenerateClassMdast(item: ApiClass | ApiInterface): Promise<Root> {
    if (![ApiItemKind.Class, ApiItemKind.Interface].includes(item.kind)) {
        throw new Error(`Expected a Class or Interface, got a: ${item.kind}`);
    }

    const tree = md.root() as Root;

    // const heading = md.heading(1, md.text(item.displayName)) as Heading;
    const [breadcrumb, summary, signature, remarks] = await Promise.all([
        getBreadcrumb(item),
        getSummary(item),
        getRemarks(item),
        getSignature(item),
    ]);
    tree.children.push(breadcrumb, summary, signature, remarks);

    // const constructors = groups.get(ApiItemKind.Constructor);
    const constructors = item.members.filter((i): i is ApiConstructor => i.kind === ApiItemKind.Constructor);
    const classes = item.members.filter((i): i is ApiClass => i.kind === ApiItemKind.Class);
    const interfaces = item.members.filter((i): i is ApiInterface => i.kind === ApiItemKind.Interface);
    const typeAliases = item.members.filter((i): i is ApiTypeAlias => i.kind === ApiItemKind.TypeAlias);
    const variables = item.members.filter((i): i is ApiVariable => i.kind === ApiItemKind.Variable);
    const functions = item.members.filter((i): i is ApiFunction => i.kind === ApiItemKind.Function);
    const enums = item.members.filter((i): i is ApiEnum => i.kind === ApiItemKind.Enum);

    if (constructors.length > 0) {
        // tree.children.push(md.heading(2, [md.text("Constructors")]) as Heading);
        // tree.children.push(await GenerateTable(constructors));

        for (const subItem of constructors) {
            const section = await GenerateItemSection(subItem, 2);
            tree.children.push(section);
        }
    }

    return tree;
}


async function GenerateItemSection(item: ApiVariable | ApiTypeAlias | ApiConstructor, headingLevel = 2): Promise<Paragraph> {
    const nodes: Content[] = [];

    if (ApiNameMixin.isBaseClassOf(item)) {
        const heading = md.heading(headingLevel, md.text(item.name)) as Heading;
        nodes.push(heading);
        nodes.push(md.text("\n\n") as Text);
    }

    if (item.tsdocComment) {
        const results = await Promise.all<Content>([
            getDeprecatedCallout(item as ApiDocumentedItem),
            getSummary(item),
            getRemarks(item)
        ]);

        nodes.push(...results)
    }

    nodes.push(await getSignature(item as ApiDeclaredItem));

    return md.paragraph(nodes) as Paragraph;
}

async function GenerateTable(items: (ApiFunction | ApiEnum | ApiVariable | ApiClass | ApiInterface | ApiTypeAlias)[]): Promise<Paragraph> {
    const table = md.table([null], []) as Table;

    let kind: ApiItemKind = ApiItemKind.Enum;
    let typeExcerpt = (item: ApiItem) => "";

    if (items.length > 0) {
        kind = items[0].kind;
        if (items[0] instanceof ApiFunction) {
            typeExcerpt = (item: ApiItem) => (item as ApiFunction).returnTypeExcerpt.text;
        } else if (items[0] instanceof ApiVariable) {
            typeExcerpt = (item: ApiItem) => (item as ApiVariable).variableTypeExcerpt.text;
        } else {
            // default
        }
    }

    // Headers are in the first row of table
    table.children.push(md.tableRow([
        md.tableCell([md.text(kind.toString())]),
        md.tableCell([md.text("Type")]),
        md.tableCell([md.text("Description")]),
        md.tableCell([md.text("Notes")])
    ]) as TableRow);

    for (const item of items) {
        const [summary, notes] = await Promise.all([getSummary(item), getNotes(item)]);
        // const summary = getSummary(item);
        // // const remarks = getRemarks(item);
        // const notes = getNotes(item);
        table.children.push(md.tableRow([
            md.tableCell([md.text(item.name)]),
            md.tableCell([md.text(typeExcerpt(item))]),
            md.tableCell([summary]),
            md.tableCell([notes])
        ]) as TableRow);
    }

    const classDecoration = md.text(`\n{.table .${kind.toLowerCase()}-table}\n`)

    return md.paragraph([table, classDecoration]) as Paragraph;
}
