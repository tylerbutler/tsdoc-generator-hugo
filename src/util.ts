/* eslint-disable unicorn/prevent-abbreviations */
import { ApiDocumentedItem, ApiItem, ApiItemContainerMixin, ApiItemKind, ApiModel, ApiPackage, ApiParameterListMixin, IResolveDeclarationReferenceResult } from "@microsoft/api-extractor-model";
import * as tsdoc from "@microsoft/tsdoc";
import chalk from "chalk";
import { string } from "yargs";

// TODO: This is a temporary workaround.  The long term plan is for API Extractor's DocCommentEnhancer
// to apply all @inheritDoc tags before the .api.json file is written.
// See DocCommentEnhancer._applyInheritDoc() for more info.
// eslint-disable-next-line unicorn/prevent-abbreviations
export function applyInheritDoc(apiItem: ApiItem, apiModel: ApiModel): void {
    if (apiItem instanceof ApiDocumentedItem) {
        // eslint-disable-next-line unicorn/no-lonely-if
        if (apiItem.tsdocComment) {
            const inheritDocTag: tsdoc.DocInheritDocTag | undefined = apiItem.tsdocComment.inheritDocTag;

            if (inheritDocTag && inheritDocTag.declarationReference) {
                // Attempt to resolve the declaration reference
                const result: IResolveDeclarationReferenceResult = apiModel.resolveDeclarationReference(
                    inheritDocTag.declarationReference,
                    apiItem
                );

                if (result.errorMessage) {
                    console.log(
                        chalk.yellow(
                            `Warning: Unresolved @inheritDoc tag for ${apiItem.displayName}: ` + result.errorMessage
                        )
                    );
                } else {
                    if (
                        result.resolvedApiItem instanceof ApiDocumentedItem &&
                        result.resolvedApiItem.tsdocComment &&
                        result.resolvedApiItem !== apiItem
                    ) {
                        _copyInheritedDocs(apiItem.tsdocComment, result.resolvedApiItem.tsdocComment);
                    }
                }
            }
        }
    }

    // Recurse members
    if (ApiItemContainerMixin.isBaseClassOf(apiItem)) {
        for (const member of apiItem.members) {
            applyInheritDoc(member, apiModel);
        }
    }
}

/**
 * Copy the content from `sourceDocComment` to `targetDocComment`.
 * This code is borrowed from DocCommentEnhancer as a temporary workaround.
 */
function _copyInheritedDocs(targetDocComment: tsdoc.DocComment, sourceDocComment: tsdoc.DocComment): void {
    targetDocComment.summarySection = sourceDocComment.summarySection;
    targetDocComment.remarksBlock = sourceDocComment.remarksBlock;

    targetDocComment.params.clear();
    for (const param of sourceDocComment.params) {
        targetDocComment.params.add(param);
    }
    for (const typeParam of sourceDocComment.typeParams) {
        targetDocComment.typeParams.add(typeParam);
    }
    targetDocComment.returnsBlock = sourceDocComment.returnsBlock;

    targetDocComment.inheritDocTag = undefined;
}

const _badFilenameCharsRegExp = /[^\w.-]/gi;

/**
 * Generates a concise signature for a function.  Example: "getArea(width, height)"
 */
export function getConciseSignature(apiItem: ApiItem): string {
    if (ApiParameterListMixin.isBaseClassOf(apiItem)) {
        return apiItem.displayName + '(' + apiItem.parameters.map((x) => x.name).join(', ') + ')';
    }
    return apiItem.displayName;
}

/**
 * Converts bad filename characters to underscores.
 */
export const getSafeFilenameForName = (name: string): string =>
    name.replace(_badFilenameCharsRegExp, '_').toLowerCase();

export function isAllowedPackage(pkg: ApiPackage, config: DocumenterConfig): boolean {
    if (config && config.onlyPackagesStartingWith) {
        if (typeof config.onlyPackagesStartingWith === "string") {
            return pkg.name.startsWith(config.onlyPackagesStartingWith);
        } else {
            return config.onlyPackagesStartingWith.some((prefix) => pkg.name.startsWith(prefix));
        }
    }
    return true;
}

import { URL } from "url"; // in Browser, the URL in native accessible on window
import { DocumenterConfig } from "./DocumenterConfig";

export const __filename = new URL("", import.meta.url).pathname;
// Will contain trailing slash
export const __dirname = new URL(".", import.meta.url).pathname;

/**
 * @description
 * Takes an Array<V>, and a grouping function,
 * and returns a Map of the array grouped by the grouping function.
 *
 * Implementation from https://stackoverflow.com/a/38327540/551579
 *
 * @param list An array of type V.
 * @param keyGetter A Function that takes the the Array type V as an input, and returns a value of type K.
 *                  K is generally intended to be a property key of V.
 *
 * @returns Map of the array grouped by the grouping function.
 */
export function groupBy<K, V>(list: readonly V[], keyGetter: (input: V) => K): Map<K, V[]> {
    const map = new Map<K, V[]>();
    list.forEach((item) => {
        const key = keyGetter(item);
        const collection = map.get(key);
        if (!collection) {
            map.set(key, [item]);
        } else {
            collection.push(item);
        }
    });
    return map;
}

export function groupByApiKind(list: readonly ApiItem[]): Map<ApiItemKind, ApiItem[]> {
    return groupBy(list, item => item.kind);
}
