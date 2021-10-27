import { ApiClass, ApiConstructor, ApiEnum, ApiFunction, ApiInterface, ApiItem, ApiItemKind, ApiMethod, ApiModel, ApiTypeAlias, ApiVariable } from "@microsoft/api-extractor-model";
import chalk from "chalk";
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
    private readonly members: ApiItem[];
    private readonly _groups: Map<ApiItemKind, ApiItem[]>;
    public readonly constructors: ApiConstructor[];
    public readonly classes: ApiClass[];
    public readonly interfaces: ApiInterface[];
    public readonly typeAliases: ApiTypeAlias[];
    public readonly variables: ApiVariable[];
    public readonly functions: ApiFunction[];
    public readonly methods: ApiMethod[];
    public readonly enums: ApiEnum[];
    public readonly others: ApiItem[];

    constructor(public readonly item: ApiItem | ApiModel) {
        if (item.kind === ApiItemKind.Model) {
            const model = item as ApiModel;
            this.members = [];

            for (const pkg of model.packages) {
                const entrypoint = pkg.members[0];
                this.members.push(...entrypoint.members);
            }
        } else {
            this.members = [...item.members];
        }

        // console.log(this.members.map(m => m.displayName));

        this._groups = groupByApiKind(this.members);

        // this.constructors = filter(item, subclass f, ApiItemKind.Constructor);
        this.constructors = item.members.filter((i): i is ApiConstructor => i.kind === ApiItemKind.Constructor);
        this.classes = item.members.filter((i): i is ApiClass => i.kind === ApiItemKind.Class);
        this.interfaces = item.members.filter((i): i is ApiInterface => i.kind === ApiItemKind.Interface);
        this.typeAliases = item.members.filter((i): i is ApiTypeAlias => i.kind === ApiItemKind.TypeAlias);
        this.variables = item.members.filter((i): i is ApiVariable => i.kind === ApiItemKind.Variable);
        this.functions = item.members.filter((i): i is ApiFunction => i.kind === ApiItemKind.Function);
        this.enums = item.members.filter((i): i is ApiEnum => i.kind === ApiItemKind.Enum);
        this.methods = item.members.filter((i): i is ApiMethod => i.kind === ApiItemKind.Method);
        this.others = item.members.filter(i => !topLevelTypes.includes(i.kind))
    }

    public get groups() {
        return this._groups;
    }

    public find(name: string, kind?: ApiItemKind, log = false): ApiItem | undefined {
        if (log) { console.log(chalk.grey(`Searching ${this.members.length} members for ${name}`)); }

        const results = this.members.filter((item) => item.displayName === name);

        if (results.length === 0) {
            // if (log) { console.log(chalk.red(`Found ${results.length} items when searching for ${name}`)); }
            return undefined;
        }
        if (log && results.length > 1) {
            console.log(chalk.yellow(`Found ${results.length} items when searching for ${name}`));
        }
        if (log) { console.log(chalk.green(`Found ${results.length} items when searching for ${name}`)); }
        return results[0];
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
