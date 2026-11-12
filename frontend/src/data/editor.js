export const languageDetails = {
  python: {
    filename: 'main.py',
    label: 'Python',
    version: 'Python 3',
    symbol: 'PY',
  },
  javascript: {
    filename: 'main.js',
    label: 'JavaScript',
    version: 'JavaScript',
    symbol: 'JS',
  },
}

export const initialCode = {
  python: `# A little collaboration goes a long way.\n# Invite your crew and build something great.\n\ndef greet(name):\n    return f"Hello, {name}! Welcome to CodeCrew."\n\n\ncrew = ["Alex", "Jamie", "You"]\n\nfor member in crew:\n    print(greet(member))\n\n# Your next great idea starts here.\n`,
  javascript: `// A little collaboration goes a long way.\n// Invite your crew and build something great.\n\nfunction greet(name) {\n  return \`Hello, \${name}! Welcome to CodeCrew.\`;\n}\n\nconst crew = ["Alex", "Jamie", "You"];\n\ncrew.forEach((member) => {\n  console.log(greet(member));\n});\n\n// Your next great idea starts here.\n`,
}
