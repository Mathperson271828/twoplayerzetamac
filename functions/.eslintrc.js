module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "commonjs",
  },
  extends: [
    "eslint:recommended",
    // "google", // The Google preset is the likely cause, leave it commented out.
  ],
  rules: {
    "quotes": ["error", "double", { "allowTemplateLiterals": true }],
  },
};
