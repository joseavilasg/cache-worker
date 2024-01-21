/** @type {import('prettier').Config} */
module.exports = {
	endOfLine: "lf",
	semi: false,
	singleQuote: false,
	tabWidth: 2,
	trailingComma: "es5",
	importOrder: [
		"<THIRD_PARTY_MODULES>",
		"",
		"^types$",
		"",
		"^[./]",
	],
	importOrderSeparation: false,
	importOrderSortSpecifiers: true,
	importOrderBuiltinModulesToTop: true,
	importOrderParserPlugins: ["typescript", "decorators-legacy"],
	importOrderMergeDuplicateImports: true,
	importOrderCombineTypeAndValueImports: true,
	plugins: ["@ianvs/prettier-plugin-sort-imports"],
}
