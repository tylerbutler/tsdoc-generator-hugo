module.exports = {
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
        "plugin:import/errors",
        "plugin:import/warnings",
        "plugin:import/typescript",
        "plugin:unicorn/recommended",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        sourceType: "module",
        ecmaFeatures: {
            jsx: true
        },
        project: "./tsconfig.json"
    },
    env: {
        es6: true,
        node: true
    },
    plugins: [
        "@typescript-eslint",
        "prefer-arrow",
        "unicorn",
    ],
    rules: {
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-use-before-define": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "@typescript-eslint/restrict-template-expressions": "off",
        "import/no-internal-modules": "off",
        "prefer-arrow/prefer-arrow-functions": [
            "warn",
            {
                "singleReturnOnly": true,
            }
        ],
        "unicorn/filename-case": [
            "error",
            {
                "cases": {
                    "camelCase": true,
                    "pascalCase": true
                }
            }
        ],
        "unicorn/prefer-node-protocol": "off",
        // "unicorn/prevent-abbreviations": [
        //     "error",
        //     {
        //         "whitelist": {
        //             "args": true,
        //             "pkg": true
        //         }
        //     }
        // ],
    }
};
