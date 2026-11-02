const fs = require('node:fs');
const path = require('node:path');
const nunjucks = require(process.env.NUNJUCKS_MODULE || 'nunjucks');
const yaml = require(process.env.YAML_MODULE || 'js-yaml');
const [manifestPath, source, destination] = process.argv.slice(2);
const docs = yaml.loadAll(fs.readFileSync(manifestPath, 'utf8'));
const template = yaml.load(docs.find(x => x?.kind === 'ConfigMap' && x.data?.['template.yaml']).data['template.yaml']);
const values = template.spec.steps.find(x => x.id === 'delivery').input.values;
values.name = template.spec.parameters[0].properties.name.default;
const environment = new nunjucks.Environment(new nunjucks.FileSystemLoader(source), {
  autoescape: false, throwOnUndefined: true,
  tags: {variableStart: '${{', variableEnd: '}}'},
});
function walk(folder) {
  for (const item of fs.readdirSync(folder, {withFileTypes: true})) {
    const full = path.join(folder, item.name);
    if (item.isDirectory()) walk(full);
    else {
      const relative = path.relative(source, full);
      const output = path.join(destination, relative);
      fs.mkdirSync(path.dirname(output), {recursive: true});
      fs.writeFileSync(output, environment.render(relative, {values}));
    }
  }
}
walk(source);
console.log('Rendered onboarding overlay with strict Nunjucks variables.');
