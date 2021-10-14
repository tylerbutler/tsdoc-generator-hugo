/* eslint-disable unicorn/prevent-abbreviations */
import { ApiDocumentedItem, ApiItem, ApiItemContainerMixin, ApiModel, ApiParameterListMixin, IResolveDeclarationReferenceResult } from "@microsoft/api-extractor-model";
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

import { URL } from "url"; // in Browser, the URL in native accessible on window

export const __filename = new URL("", import.meta.url).pathname;
// Will contain trailing slash
export const __dirname = new URL(".", import.meta.url).pathname;
