const parser = require('@typescript-eslint/parser');
const plugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: parser,
        },
        plugins: {
            "@typescript-eslint": plugin,
        },
        rules: {
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
            "@typescript-eslint/no-explicit-any": "warn"
        }
    }
];
