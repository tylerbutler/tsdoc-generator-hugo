import { ApiItem, ApiItemKind, ApiPackage } from "@microsoft/api-extractor-model";
import { Root } from "mdast";

export interface MdOutputPage {
    item: ApiItem;
    // itemName: string;
    // unscopedPackageName: string;
    // packageName: string;
    mdast: Root;
    // package?: ApiPackage;
}
