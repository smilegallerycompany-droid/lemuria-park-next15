import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tailwindcss from "eslint-plugin-tailwindcss";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript", "plugin:jsx-a11y/recommended"),
  ...tailwindcss.configs["flat/recommended"],
  {
    settings: {
      tailwindcss: {
        callees: ["cn", "cva"],
        config: `${__dirname}/tailwind.config.ts`,
        whitelist: ["director-.*", "cashier-.*"],
      },
    },
  },
  {
    files: ["src/app/director/**/*.{ts,tsx}", "src/app/(cashier)/**/*.{ts,tsx}"],
    rules: {
      // Staff UIs use adjacent label/input pairs styled by scoped CSS.
      "jsx-a11y/label-has-associated-control": "off",
      "jsx-a11y/no-autofocus": "off",
      "tailwindcss/no-custom-classname": "off",
    },
  },
];

export default eslintConfig;
