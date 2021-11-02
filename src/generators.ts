import {
    ApiClass,
    ApiConstructor,
    ApiDeclaredItem,
    ApiDocumentedItem,
    ApiEnum,
    ApiEnumMember,
    ApiFunction,
    ApiInterface,
    ApiItem,
    ApiItemKind, ApiMethod, ApiMethodSignature, ApiModel, ApiNameMixin, ApiPackage, ApiParameterListMixin, ApiProperty, ApiPropertyItem, ApiPropertySignature, ApiTypeAlias,
    ApiVariable
} from "@microsoft/api-extractor-model";
import chalk from "chalk";
import type { Code, Content, Heading, Paragraph, Root, Table, TableCell, TableRow, Text } from "mdast";
import * as md from "mdast-builder";
import { ApiItemWrapper, ApiModelWrapper } from "./ApiModelWrapper.js";
import { DocumenterConfig } from "./DocumenterConfig.js";
import { hasType, hugoLabel, linkIfFound, linkItem, spacer } from "./mdNodes.js";
import { getBreadcrumb, getDeprecatedCallout, getExtends, getFunctionParameters, getNotes, getRemarks, getReturn, getSignature, getSummary, isDeprecated } from "./sections.js";
import { MdOutputPage } from "./types.js";

/**
 * Generates an MDAST tree for an ApiItem.
 *
 * @param apiPackage The item to generate MDAST for.
 * @param outputPath
 * @returns A tuple of the MDAST for the current item, and an array of MDAST for any other items that were generated.
 */
export async function GeneratePackageMdast(apiPackage: ApiPackage, model: ApiModel, config: DocumenterConfig): Promise<[Root, MdOutputPage[] | undefined, MdOutputPage[] | undefined]> {
    if (![ApiItemKind.Package, ApiItemKind.Class].includes(apiPackage.kind)) {
        throw new Error(`Expected a Package, got a: ${apiPackage.kind}`);
    }

    const tree = md.root() as Root;
    const others: MdOutputPage[] = [];

    const entrypoint = apiPackage.members[0];
    console.log(chalk.gray(`Found package entrypoint -- ${entrypoint.members.length} members`));
    const pkg = new ApiItemWrapper(entrypoint);

    const heading = md.heading(1, md.text(apiPackage.displayName)) as Heading;
    const [breadcrumb, summary, remarks] = await Promise.all([
        getBreadcrumb(entrypoint, model, config),
        getSummary(apiPackage, true),
        getRemarks(apiPackage)
    ]);
    tree.children.push(heading, breadcrumb, summary, remarks);

    let interfacePages: Promise<MdOutputPage[]> | undefined;
    let classPages: Promise<MdOutputPage[]> | undefined;

    if (pkg.interfaces.length > 0) {
        tree.children.push(md.heading(2, [md.text("Interfaces")]) as Heading);
        tree.children.push(await GenerateTable(pkg.interfaces, model, config));

        interfacePages = Promise.all(pkg.interfaces.map(async (i): Promise<MdOutputPage> => {
            const ast = await GenerateClassMdast(i, model, config);
            return {
                mdast: ast,
                item: i,
            }
        }));
        // if (interfacePages) {
        //     otherPages.push(interfacePages);
        // }
    }

    if (pkg.classes.length > 0) {
        tree.children.push(md.heading(2, [md.text("Classes")]) as Heading);
        tree.children.push(await GenerateTable(pkg.classes, model, config));

        classPages = Promise.all(pkg.classes.map(async (i): Promise<MdOutputPage> => {
            const ast = await GenerateClassMdast(i, model, config);
            return {
                mdast: ast,
                item: i,
            }
        }));
        // otherPages.push(Promise.all(classes.map(async (i): Promise<MdOutputPage> => {
        //     const ast = await GenerateClassMdast(i, model);
        //     return {
        //         mdast: ast,
        //         item: i,
        //     }
        // })));
    }

    if (pkg.enums.length > 0) {
        tree.children.push(md.paragraph([md.heading(2, [md.text("Enums")])]) as Paragraph);
        // tree.children.push(await GenerateTable(wrapper.enums, model));

        for (const subItem of pkg.enums) {
            const section = await GenerateItemSection(subItem, 3, model, config);
            tree.children.push(section);
        }
    }

    if (pkg.functions.length > 0) {
        tree.children.push(md.heading(2, [md.text("Functions")]) as Heading);
        tree.children.push(await GenerateTable(pkg.functions, model, config));
    }

    if (pkg.variables.length > 0) {
        tree.children.push(md.heading(2, [md.text("Variables")]) as Heading);
        if (pkg.variables.length > 10) {
            tree.children.push(await GenerateTable(pkg.variables, model, config));
        }

        for (const subItem of pkg.variables) {
            const section = await GenerateItemSection(subItem, 3, model, config);
            tree.children.push(section);
        }
    }

    if (pkg.typeAliases.length > 0) {
        tree.children.push(md.heading(2, [md.text("Type aliases")]) as Heading);
        // tree.children.push(await GenerateTable(typeAliases));

        for (const subItem of pkg.typeAliases) {
            const section = await GenerateItemSection(subItem, 3, model, config);
            tree.children.push(section);
        }
    }

    // console.log(tree);
    // if (otherPages.length > 0) {
    //     console.log(chalk.yellowBright(`${(await otherPages).length}`));
    //     for(const pageCollection of otherPages) {
    //         const pages = await pageCollection;
    //     }
    //     others.push(...await otherPages);
    // }

    return [tree, await classPages, await interfacePages];
}

export async function GenerateClassMdast(item: ApiClass | ApiInterface, model: ApiModel, config: DocumenterConfig): Promise<Root> {
    console.log(`GenerateClassMdast called for ${item.displayName}`);
    if (![ApiItemKind.Class, ApiItemKind.Interface].includes(item.kind)) {
        throw new Error(`Expected a Class or Interface, got a: ${item.kind}`);
    }

    const tree = md.root() as Root;

    const heading = md.heading(1, md.text(item.displayName)) as Heading;
    const [breadcrumb, extendSection, summary, remarks, signature] = await Promise.all([
        getBreadcrumb(item, model, config),
        getExtends(item, model, config),
        getSummary(item, true),
        getRemarks(item),
        getSignature(item, true),
    ]);
    tree.children.push(
        heading,
        breadcrumb,
        extendSection,
        summary,
        remarks,
        signature,
    );
    // tree.children.push(await );

    const wrapper = new ApiItemWrapper(item);

    if (wrapper.constructors.length > 0) {
        // tree.children.push(md.heading(2, [md.text("Constructor")]) as Heading);
        // tree.children.push(await GenerateTable(constructors));

        for (const subItem of wrapper.constructors) {
            const section = await GenerateItemSection(subItem, 2, model, config);
            tree.children.push(section);
        }
    }

    if (wrapper.methods.length > 0) {
        tree.children.push(md.heading(2, [md.text("Methods")]) as Heading);

        for (const subItem of wrapper.methods) {
            const section = await GenerateItemSection(subItem, 3, model, config);
            tree.children.push(section);
        }
    }

    if (wrapper.methodSignatures.length > 0) {
        tree.children.push(md.heading(2, [md.text("Methods")]) as Heading);

        for (const subItem of wrapper.methodSignatures) {
            const section = await GenerateItemSection(subItem, 3, model, config);
            tree.children.push(section);
        }
    }

    if (wrapper.properties.length > 0) {
        tree.children.push(md.heading(2, [md.text("Properties")]) as Heading);

        for (const subItem of wrapper.properties) {
            const section = await GenerateItemSection(subItem, 3, model, config);
            tree.children.push(section);
        }
    }

    if (wrapper.propertySignatures.length > 0) {
        tree.children.push(md.heading(2, [md.text("Properties")]) as Heading);

        for (const subItem of wrapper.propertySignatures) {
            const section = await GenerateItemSection(subItem, 3, model, config);
            tree.children.push(section);
        }
    }


    // tree.children.push(await getFunctionParameters(item, model));

    return tree;
}


async function GenerateItemSection(
    item: ApiVariable | ApiTypeAlias | ApiConstructor | ApiMethod | ApiMethodSignature | ApiProperty | ApiPropertySignature | ApiEnum | ApiEnumMember,
    headingLevel = 2,
    model: ApiModel,
    config: DocumenterConfig
): Promise<Paragraph> {
    const nodes: Content[] = [];
    let name: string = "";
    const wrapper = new ApiModelWrapper(model);//model !== undefined ? new ApiModelWrapper(model) : undefined;

    if (ApiNameMixin.isBaseClassOf(item)) {
        name = item.name;
    } else if (item instanceof ApiConstructor) {
        name = "Constructor";
    }

    const heading = md.heading(headingLevel, md.text(name)) as Heading;
    if (await isDeprecated(item)) {
        heading.children.push(hugoLabel("Deprecated", "default"));
    }
    nodes.push(heading);
    nodes.push(spacer());

    if (item.tsdocComment) {
        const results = await Promise.all<Content>([
            getDeprecatedCallout(item as ApiDocumentedItem),
            getSummary(item, true),
            getRemarks(item),
        ]);

        nodes.push(...results)
        nodes.push(spacer());
    }

    nodes.push(await getReturn(item));

    if (ApiParameterListMixin.isBaseClassOf(item)) {
        const params = await getFunctionParameters(item, model, config);
        if (params) {
            nodes.push(params);
        }
    }

    // Properties
    if (item instanceof ApiPropertyItem) {
        nodes.push(md.paragraph([
            md.strong(md.text("Type:")),
            md.text(" "),
            linkIfFound(wrapper, item.propertyTypeExcerpt.text, config),
            spacer()
        ]) as Paragraph);
    }

    // Enum members
    if (item instanceof ApiEnum) {
        const codeBlock: string[] = [];
        const memberNodes: Content[] = [];
        for (const m of item.members) {
            codeBlock.push(m.excerpt.text)
            memberNodes.push(await GenerateItemSection(m, 4, model, config));
        }
        nodes.push(md.code("typescript", codeBlock.join("\n")) as Code);
        nodes.push(spacer());
        nodes.push(...memberNodes);
        nodes.push(spacer());
    }

    // Include signature unless it's an enum/enum member
    if (!(item instanceof ApiEnumMember) && !(item instanceof ApiEnum)) {
        nodes.push(await getSignature(
            item as ApiDeclaredItem,
            true
        ));
    }

    return md.paragraph(nodes) as Paragraph;
}

async function GenerateTable(items: (ApiFunction | ApiEnum | ApiVariable | ApiClass | ApiInterface | ApiTypeAlias)[], model: ApiModel, config: DocumenterConfig): Promise<Paragraph> {
    const table = md.table([null], []) as Table;

    const wrapper = new ApiModelWrapper(model);//model ? new ApiModelWrapper(model) : undefined;

    let kind: ApiItemKind = ApiItemKind.Enum;
    let typeExcerpt = (item: ApiItem) => "";
    let hasTypeColumn = false;

    if (items.length > 0) {
        kind = items[0].kind;
        hasTypeColumn = hasType(items[0]);
        if (items[0] instanceof ApiFunction) {
            typeExcerpt = (item: ApiItem) => (item as ApiFunction).returnTypeExcerpt.text;
        } else if (items[0] instanceof ApiVariable) {
            typeExcerpt = (item: ApiItem) => (item as ApiVariable).variableTypeExcerpt.text;
        } else if (items[0] instanceof ApiPropertyItem) {
            typeExcerpt = (item: ApiItem) => (item as ApiPropertyItem).propertyTypeExcerpt.text;
        } else {
            // default
        }
    }

    const headerCells = [
        md.tableCell([md.text(kind.toString())]),
        md.tableCell([md.text("Type")]),
        md.tableCell([md.text("Description")]),
        md.tableCell([md.text("Notes")])
    ] as TableCell[];

    if (!hasTypeColumn) {
        // remove the type column
        headerCells.splice(1, 1);
    }

    // Headers are in the first row of table
    table.children.push(md.tableRow(headerCells) as TableRow);

    for (const item of items) {
        const [summary, notes] = await Promise.all([getSummary(item), getNotes(item)]);
        // const summary = getSummary(item);
        // // const remarks = getRemarks(item);
        // const notes = getNotes(item);
        const cells = [
            md.tableCell([linkItem(wrapper, item, config)]),
            md.tableCell([md.text(typeExcerpt(item))]),
            md.tableCell([summary]),
            md.tableCell([notes])
        ] as TableCell[];

        if (!hasTypeColumn) {
            cells.splice(1, 1);
        }

        table.children.push(md.tableRow(cells) as TableRow);
    }

    const classDecoration = md.text(`\n{.table .${kind.toLowerCase()}-table}\n`)

    return md.paragraph([table, classDecoration]) as Paragraph;
}
