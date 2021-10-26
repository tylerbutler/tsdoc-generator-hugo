import { ApiClass, ApiConstructor, ApiEnum, ApiFunction, ApiInterface, ApiItem, ApiItemKind, ApiModel, ApiTypeAlias, ApiVariable } from "@microsoft/api-extractor-model";
import { groupByApiKind } from "./util.js";

const topLevelTypes = [
    ApiItemKind.Constructor,
    ApiItemKind.Class,
    ApiItemKind.Interface,
    ApiItemKind.TypeAlias,
    ApiItemKind.Variable,
    ApiItemKind.Function,
    ApiItemKind.Enum,
];

export class ApiItemWrapper {
    private readonly _groups: Map<ApiItemKind, ApiItem[]>;
    public readonly constructors: ApiConstructor[];
    public readonly classes: ApiClass[];
    public readonly interfaces: ApiInterface[];
    public readonly typeAliases: ApiTypeAlias[];
    public readonly variables: ApiVariable[];
    public readonly functions: ApiFunction[];
    public readonly enums: ApiEnum[];
    public readonly others: ApiItem[];

    constructor(public readonly item: ApiItem) {
        this._groups = groupByApiKind(item.members);

        // this.constructors = filter(item, subclass f, ApiItemKind.Constructor);
        this.constructors = item.members.filter((i): i is ApiConstructor => i.kind === ApiItemKind.Constructor);
        this.classes = item.members.filter((i): i is ApiClass => i.kind === ApiItemKind.Class);
        this.interfaces = item.members.filter((i): i is ApiInterface => i.kind === ApiItemKind.Interface);
        this.typeAliases = item.members.filter((i): i is ApiTypeAlias => i.kind === ApiItemKind.TypeAlias);
        this.variables = item.members.filter((i): i is ApiVariable => i.kind === ApiItemKind.Variable);
        this.functions = item.members.filter((i): i is ApiFunction => i.kind === ApiItemKind.Function);
        this.enums = item.members.filter((i): i is ApiEnum => i.kind === ApiItemKind.Enum);
        this.others = item.members.filter(i => !topLevelTypes.includes(i.kind))
    }

    public get groups() {
        return this._groups;
    }

    // public get(index: ApiItemKind): ApiItem[] {
    //     return this.groups.get(index) ?? [];
    // }

    // public get constructors() { return this.groups.get(ApiItemKind.Constructor); }
    // public get classes() { return this.groups.get(ApiItemKind.Class); }
    // public get interfaces() { return this.groups.get(ApiItemKind.Interface); }
    // public get typeAliases() { return this.groups.get(ApiItemKind.TypeAlias); }
    // public get variables() { return this.groups.get(ApiItemKind.Variable); }
    // public get enums() { return this.groups.get(ApiItemKind.Enum); }
}

// const filter = (item: ApiItem, klass: any, kind: ApiItemKind): (typeof klass)[] | undefined => {
//     const res = item.members.filter((i): i is (typeof klass) => i.kind === kind);
//     if (res.length === 0) {
//         return undefined;
//     }
//     return res;
// };

// const isConstructor = (item: ApiItem): item is ApiConstructor {
//     return item.kind === ApiItemKind.Constructor;
// }
