import * as core from "@actions/core";
import {AnyRule, FilterList, RuleConverter} from "@adguard/agtree";
import {FilterListConverter} from "@adguard/agtree/converter";
import {FilterListGenerator} from "@adguard/agtree/generator";
import {FilterListParser} from "@adguard/agtree/parser";
import {existsSync} from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
// @ts-ignore
import {createConversionResult} from "./node_modules/@adguard/agtree/dist/converter/base-interfaces/conversion-result.js";
// @ts-ignore
import {clone} from "./node_modules/@adguard/agtree/dist/utils/clone.js";
// @ts-ignore
import {MultiValueMap} from "./node_modules/@adguard/agtree/dist/utils/multi-value-map.js";

function getOutputName(file: string, pattern: string, target: string) {
    const name = path.basename(file, path.extname(file));
    return pattern.replace("[name]", name).replace("[target]", target === "adguard" ? "Adg" : "uBo");
}

async function getFiles(paths: string[]): Promise<string[]> {
    const results: string[] = [];

    for (const p of paths) {
        try {
            const stat = await fs.stat(p);

            if (stat.isDirectory()) {
                const files = (await fs.readdir(p, {recursive: true}))
                    .filter((file) => file.endsWith(".txt"))
                    .map((file) => path.join(p, file));

                results.push(...files);

                continue;
            }

            if (stat.isFile() && p.endsWith(".txt")) {
                results.push(p);
            }
        } catch {
        }
    }

    return results;
}

function convertToABo(filterListNode: FilterList, tolerant = true) {
    const conversionMap = new MultiValueMap<number, AnyRule>();

    for (let i = 0; i < filterListNode.children.length; i += 1) {
        try {
            const convertedRules = RuleConverter.convertToAdg(filterListNode.children[i]);

            if (convertedRules.isConverted) {
                conversionMap.add(i, ...convertedRules.result);
            }
        } catch (error) {
            if (!tolerant) throw error;
        }
    }

    if (conversionMap.size === 0) {
        return createConversionResult(filterListNode, false);
    }

    const convertedFilterList: FilterList = {
        type: "FilterList",
        children: []
    };

    for (let i = 0; i < filterListNode.children.length; i += 1) {
        const rules = conversionMap.get(i);

        if (rules) {
            convertedFilterList.children.push(...rules);
        } else {
            convertedFilterList.children.push(clone(filterListNode.children[i]));
        }
    }

    return createConversionResult(convertedFilterList, true);
}

function convert(raw: string, target: "adguard" | "ublock") {
    const filterList = FilterListParser.parse(raw);

    const conversionResult = target === "adguard"
        ? FilterListConverter.convertToAdg(filterList)
        : convertToABo(filterList);

    return FilterListGenerator.generate(conversionResult.result);
}

async function ensureDir(dir: string) {
    if (!existsSync(dir))
        await fs.mkdir(dir, {recursive: true});
}

export async function runAction() {
    try {
        const targetFiles = core.getMultilineInput("paths").filter(Boolean);
        const outDir = core.getInput("out_dir");

        const inPlace = !outDir;

        const validTargets = ["adguard", "ublock"] as const;

        const targets = core.getMultilineInput("targets")
            .map(t => t.trim())
            .filter(t => validTargets.includes(t as any)) as ("adguard" | "ublock")[];

        const namePattern = core.getInput("name_pattern");
        const files = await getFiles(targetFiles);

        if (files.length === 0) {
            core.warning("No valid files found.");
            return;
        }

        for (const target of targets) {
            for (const input of files) {
                try {
                    const raw = await fs.readFile(input, "utf-8");
                    const converted = convert(raw, target);

                    const outName = getOutputName(input, namePattern, target);
                    const outDirFinal = inPlace ? path.dirname(input) : outDir;
                    await ensureDir(outDirFinal);
                    const outPath = path.join(outDirFinal, outName);

                    await fs.writeFile(outPath, converted, "utf-8");
                    core.info(`✅ Successfully converted "${input}" to "${outPath}"`);
                } catch (fileError) {
                    core.error(`❌ Failed to convert file "${input}": ${fileError}`);
                }
            }
        }
    } catch (error) {
        core.setFailed(`Action failed: ${error}`);
    }
}

runAction();
