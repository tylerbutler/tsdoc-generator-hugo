import { ApiClass, ApiConstructor, ApiEnum, ApiFunction, ApiInterface, ApiItem, ApiItemKind, ApiMethod, ApiMethodSignature, ApiModel, ApiProperty, ApiPropertySignature, ApiTypeAlias, ApiVariable } from "@microsoft/api-extractor-model";
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

export abstract class ApiWrapper {
    protected readonly members: ApiItem[] = [];
    protected readonly _groups: Map<ApiItemKind, ApiItem[]>;
    public readonly constructors: ApiConstructor[];
    public readonly classes: ApiClass[];
    public readonly interfaces: ApiInterface[];
    public readonly typeAliases: ApiTypeAlias[];
    public readonly variables: ApiVariable[];
    public readonly functions: ApiFunction[];
    public readonly methods: ApiMethod[];
    public readonly methodSignatures: ApiMethodSignature[];
    public readonly enums: ApiEnum[];
    public readonly properties: ApiProperty[];
    public readonly propertySignatures: ApiPropertySignature[];
    public readonly others: ApiItem[];

    constructor(public readonly item: ApiItem | ApiModel) {
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
        this.methodSignatures = item.members.filter((i): i is ApiMethodSignature => i.kind === ApiItemKind.MethodSignature);
        this.properties = item.members.filter((i): i is ApiProperty => i.kind === ApiItemKind.Property);
        this.propertySignatures = item.members.filter((i): i is ApiPropertySignature => i.kind === ApiItemKind.PropertySignature);
        this.others = item.members.filter(i => !topLevelTypes.includes(i.kind))
    }

    public get groups() {
        return this._groups;
    }
}
export class ApiItemWrapper extends ApiWrapper {
    constructor(public readonly item: ApiItem) {
        super(item);
        this.members.push(...item.members);
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

export class ApiModelWrapper extends ApiWrapper {
    constructor(public readonly model: ApiModel) {
        super(model);

        for (const pkg of model.packages) {
            const entrypoint = pkg.members[0];
            this.members.push(...entrypoint.members);
        }
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
}
