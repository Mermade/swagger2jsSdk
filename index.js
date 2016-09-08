/* openAPI2js - generate simple Javascript API from Swagger spec suitable for use with OpenNitro SDK
*/

var fs = require('fs');
var path = require('path');

var map = [];

String.prototype.toCamelCase = function camelize() {
	return this.toLowerCase().replace(/[-_ \/\.](.)/g, function(match, group1) {
		return group1.toUpperCase();
    });
};

function sanitise(s,brackets) {
	s = s.replaceAll('\'','').replaceAll('(','').replaceAll(')','').replaceAll(';','');
	if (brackets) s = s.replaceAll('{','').replaceAll('}','');
	return s;
}

String.prototype.replaceAll = function(search, replacement) {
	var result = this;
	while (true) {
		result = result.split(search).join(replacement);
		if (result.indexOf(search)<0) break;
	}
	return result;
};

function uniq(s) {
	var result = s;
	count = 2;
	while (map.indexOf(result)>=0) {
		result = s + count;
		count++;
	}
	return result;
}

function extractParameters(container,prefix) {
	var out = '';
	for (var sp in container) {
		var swagParam = container[sp];
		if (swagParam.description && ((swagParam['in'] == 'query') || (swagParam['enum']))) {
			out += '/** ' + swagParam.description + ' */\n';
		}
		if (swagParam['in'] == 'query') {
			var cName = prefix+('/'+swagParam.name).toCamelCase();
			out += 'const ' + cName + " = '" + swagParam.name + "';\n";
			map.push(cName);
		}
		if (swagParam['enum']) {
			for (var e in swagParam['enum']) {
				var value = swagParam['enum'][e];
				var eName = prefix+('/'+swagParam.name+'/'+value).toCamelCase();
				if (swagParam['in'] == 'query') {
					out += 'const ' + eName + " = '" + swagParam.name + "=" + value + "';\n";
				}
				else {
					out += 'const ' + eName + " = '" + value + "';\n";
				}
				map.push(eName);
			}
		}
	}
	return out;
}

module.exports = {

	openAPI2js : function(input,outfile) {

		var swagger = {};
		if (typeof input === 'object') {
			swagger = input;
		}
		else {
			swagger = require(path.resolve(input));
		}
		var actions = ['get','head','post','put','delete','patch','options','trace','connect'];
		var out = '';

		out += '/**\n';
		out += '@author openapi2js http://github.com/mermade/openapi2js\n';
		out += '@copyright Copyright (c) 2016 Mike Ralphson\n';
		out += '@license https://opensource.org/licenses/BSD-3-Clause\n';
		out += '*/\n';

		out += extractParameters(swagger.parameters,'common');

		for (var p in swagger.paths) {
			pRoot = p.replace('.atom','');
			pRoot = pRoot.replace('.xml','');
			pRoot = pRoot.replace('.json','');
			var sPath = swagger.paths[p];

			var pName = ('all'+pRoot).toCamelCase();
			pName = uniq(pName);

			out += extractParameters(sPath.parameters,pName);

			for (var a in actions) {
				var action = sPath[actions[a]];
				if (action) {
					out += '\n/** '+(action.description ? action.description : action.summary ? action.summary : 'No description');

					pName = (actions[a]+pRoot).toCamelCase();
					pName = uniq(pName);

					if (p.indexOf('{')>=0) {
						var params = [];
						var p2 = pRoot.replace(/(\{.+?\})/g,function(match,group1){
							params.push(group1.replace('{','').replace('}',''));
							return '';
						});
						p2 = p2.replace('-/','/');

						for (var arg in params) {

							var pType = 'string';
							var pDesc = 'No description';

							for (var sp in action.parameters) {
								var sParam = action.parameters[sp];
								if (sParam["$ref"]) {
									cParamName = sParam["$ref"].replace('#/parameters/','');
									sParam = swagger.parameters[cParamName];
								}

								if (sParam.name == params[arg]) {
									pType = sParam.type;
									pDesc = sParam.description;
								}
							}

							out += '\n@param {' + pType + '} ' + params[arg] + ' ' + pDesc;
						}

						out += '\n@return {string} The path to request\n';

						pName = (actions[a]+p2).replaceAll('//','/').toCamelCase();
						if (pName[pName.length-1] == '-') pName = pName.substr(0,pName.length-1);
						while (pName[pName.length-1] == '/') pName = pName.substr(0,pName.length-1);
						pName = uniq(sanitise(pName,true));

						out += '*/\nfunction '+pName+'(';
						for (var arg in params) {
							if (params[arg].substr(0,1).match(/[0-9]/)) {
								params[arg] = '_'+params[arg];
							}
							out += (arg > 0 ? ',' : '') + params[arg].toCamelCase();
						}
						out += '){\n';
						out += "  var p = '" + sanitise((swagger.basePath + p).replaceAll('//','/'),false) + "';\n";
						for (var arg in params) {
							out += "  p = p.replace('{" + params[arg] + "}'," + params[arg].toCamelCase() + ");\n";
						}
						out += '  return p;\n';
						out += '}\n';
					}
					else {
						out += '*/\nconst '+pName+" = '"+(swagger.basePath+p).replace('//','/')+"';\n";
					}
					map.push(pName);

					out += extractParameters(action.parameters,pName);
				}
			}
		}

		out += '\nmodule.exports = {\n';
		for (var m in map) {
			out += '  ' + map[m] + ' : ' + map[m] + ',\n';
		}
		out += "  host : '" + swagger.host + "'\n";
		out += '};\n';

		if (outfile) fs.writeFileSync(outfile,out,'utf8');

		return out;
	}
};
