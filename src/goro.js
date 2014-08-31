define(function (require) {
	'use strict';

	// Also field descriptors should respect serialize and deserialize
	var Types = {
		int : {
			deserialize : function (attrValue) {
				return parseInt(attrValue, 10);
			}
		},
		number : {
			deserialize : function (attrValue) {
				return parseFloat(attrValue);
			}
		},
		boolean : {
			deserialize : function (attrValue) {
				return attrValue != null;
			}
		},
		string : {
			deserialize : function (attrValue) {
				return attrValue;
			}
		},
	};

	function serialize(value) {
		return '' + value;
	}

	function deserialize(attrValue, type) {
		var deserialized = attrValue;

		var typeDescriptor = Types[type];
		if (typeDescriptor) {
			var converterFn = typeDescriptor.deserialize;
			if (typeof deserialize === 'function') {
				deserialized = converterFn(attrValue);
			}
		}

		return deserialized;
	}

	function forEach(obj, iterator, ctx) {
		if (!obj) return;
		for (var key in obj) {
			if (obj.hasOwnProperty(key)) {
				var result = iterator.call(ctx, obj[key], key, obj);
				if (result === false) {
					return;
				}
			}
		}
	}

	function callSafely(container, methodName, ctx, args) {
		var method = container[methodName];
		if (typeof method === 'function') {
			method.apply(ctx, args);
		}
	}

	function getFieldDescriptor(el, fieldName) {
		return el.fields[fieldName];
	}

	function setField(el, fieldName, newVal, source) {
		var fieldDesc = getFieldDescriptor(el, fieldName);

		var oldVal = fieldDesc.value;
		if (oldVal !== newVal) {
			fieldDesc.value = newVal;
			if (source !== 'attribute') {
				var attrName = fieldDesc.attributeName || fieldName;
				var attrValue = serialize(newVal);
				el.setAttribute(attrName, attrValue);
			}
			if (source !== 'property') {
				var propName = fieldDesc.propertyName || fieldName;
				var propValue = newVal;
				el[propName] = propValue;
			}

			callSafely(fieldDesc, 'onChange', el, [newVal, oldVal]);
		}
	}

	function createPrototype(def) {
		var parent = def.parent || HTMLElement;
		var parentProto = parent.prototype;

		var fields = def.fields || {};

		var fieldsByAttributeName = {};
		forEach(fields, function (fieldDesc, fieldName) {
			var attrName = fieldDesc.attributeName || fieldName;
			if (attrName in fieldsByAttributeName) {
				var msg = [
					'More than one field is defined that uses the attribute name ',
					JSON.stringify(attrName),
				].join('');
				throw new Error(msg);
			}
			fieldDesc.fieldName = fieldName;
			fieldsByAttributeName[attrName] = fieldDesc;
		});

		var proto = Object.create(parentProto, {
			root : {
				configurable : true,
				value : null
			},
			template : {
				value : (def.template || null),
			},
			fields : {
				value : (def.fields || {}),
			},

			createdCallback : {
				value : function createdCallback() {
					var root = null;

					var tpl = this.template;
					if (tpl) {
						var content = document.importNode(tpl, true).content;
						root = this.createShadowRoot();
						root.appendChild(content);
					}

					Object.defineProperty(this, 'root', {
						value : root
					});

					var attributes = this.attributes;
					for (var i=0, len=attributes.length; i<len; i++) {
						var attr = attributes[i];
						var fieldDesc = fieldsByAttributeName[attr.name];
						if (fieldDesc && !fieldDesc.suppressAttribute) {
							var attrValue = attr.value;
							// TODO respect fieldDesc.deserialize
							var value = deserialize(attr.value, fieldDesc.type);
							setField(this, fieldDesc.fieldName, value, 'attribute');
						}
					}

					callSafely(def, 'onCreate', this);
				}
			},

			attachedCallback : {
				value : function attachedCallback() {
					callSafely(def, 'onAttach', this);
				}
			},

			detachedCallback : {
				value : function detachedCallback() {
					callSafely(def, 'onDetach', this);
				}
			},

			attributeChangedCallback : {
				value : function attributeChangedCallback(attrName, oldVal, newVal) {
					var fieldDesc = fieldsByAttributeName[attrName];
					if (fieldDesc && !fieldDesc.suppressAttribute) {
						// TODO respect fieldDesc.deserialize
						var value = deserialize(newVal, fieldDesc.type);
						setField(this, fieldDesc.fieldName, value, 'attribute');
					}
				}
			},
		});

		forEach(fields, function (fieldDesc, fieldName) {
			if (!fieldDesc.suppressProperty) {
				var propName = fieldDesc.propertyName || fieldName;
				var isReadyOnly = fieldDesc.readOnlyProperty;
				var propDesc = {
					enumerable : true,
					get : function () {
						return fieldDesc.value;
					}
				};
				if (!fieldDesc.readOnlyProperty) {
					propDesc.set = function (newVal) {
						setField(this, fieldName, newVal, 'property');
						return fieldDesc.value;
					};
				}
				Object.defineProperty(proto, propName, propDesc);
			}
		});

		forEach(fields.proto, function (val, key) {
			proto[key] = val;
		});

		return proto;
	}

	function ElementDefinition(elName, def) {
		if (!(this instanceof ElementDefinition)) {
			var result = Object.create(ElementDefinition.prototype);
			ElementDefinition.apply(result, arguments);
			return result;
		}

		Object.defineProperties(this, {
			name : {
				enumerable : true,
				writable : true,
				value : elName
			},
			register : {
				writable : false,
				value : function (name) {
					if (name) {
						this.name = name;
					}
					var proto = createPrototype(def);
					return document.registerElement(elName, {
						prototype : proto
					});
				}
			}
		});
	}



	// define goro.template plugin
	define('goro.template', {
		load : function (name, req, onload, config) {
			var linkEl = document.createElement('link');
			linkEl.rel = 'import';

			var url = req.toUrl(name);
			if (!/\.[^\/?#]+(?![^?#])/.test(url)) {
				url += '.html';
			}
			linkEl.href = req.toUrl(url);

			linkEl.onload = function () {
				var err = null;

				var doc = linkEl.import;
				if (!doc) {
					var msg = [
						'Failed to find link.import for URL ',
						JSON.stringify(url),
						' while trying to load module ',
						JSON.stringify(name),
					].join('');
					return onload.error(Error(msg));
				}

				var tpl = doc.querySelector('template');
				if (!tpl) {
					var msg = [
						'Failed to find a <template> element in document ',
						JSON.stringify(url),
						' while trying to load module ',
						JSON.stringify(name),
					].join('');
					return onload.error(Error(msg));
				}

				var imported = document.importNode(tpl, true);
				if (!imported) {
					var msg = [
						'Failed to import <template> element from document ',
						JSON.stringify(url),
						' while trying to load module ',
						JSON.stringify(name),
					];
					return onload.error(Error(msg));
				}

				onload(imported);
			};
			linkEl.onerror = function () {
				var msg = [
					'Failed to find template file ',
					JSON.stringify(url),
					' while trying to load module ',
					JSON.stringify(name),
				].join('');
				onload.error(Error(msg));
			};

			document.head.appendChild(linkEl);
		}
	});

	function convertToElementName(moduleName) {
		return moduleName
				.replace(/[?#].*/, '')
				.replace(/.*\//, '')
				.replace(/\..*/, '')
				.replace(/^[A-Z]/, function (ch) { return ch.toLowerCase(); })
				.replace(/[A-Z]/g, function (ch) { return '-' + ch.toLowerCase(); });
	}

	define('goro.definition', {
		load : function (name, req, onload, config) {
			// TODO does this work at all?
			var config = require.config || (require.config = {});
			var map = config.map || (config.map = {});
			var tplName = name.replace(/\.js(?![^?#])/, '');
			map[name] = {
				template : 'goro.template!' + tplName
			};

			req([name], function (definition) {
				var elementName = convertToElementName(name);
				onload(ElementDefinition(elementName, definition));
			}, function (err) {
				onload.error(err);
			});
		}
	});



	function importElementFromSrc(el) {
		el.srcHasLoaded = true;
		var src = el.src;
		require(['goro.definition!' + el.src], function (def) {
			var ElementClass = null;
			try {
				ElementClass = def.register();
			} catch (e) {
				var elName = convertToElementName(src);
				ElementClass = document.createElement(elName).constructor;
				if (ElementClass === HTMLUnknownElement) {
					ElementClass = null;
				}
			}

			if (ElementClass) {
				el.ElementClass = ElementClass;
				callSafely(el, 'onload');
			} else {
				callSafely(el, 'onerror');
			}
		}, function (err) {
			callSafely(el, 'onerror');
		});
	}

	var loaderDefinition = new ElementDefinition('goro-element', {
		proto : {
			attached : false,
			srcHasLoaded : false,
			onload : null,
			onerror : null,
			ElementClass : null,
		},
		fields : {
			src : {
				type : 'string',
				onChange : function (val) {
					this.ElementClass = null;
					if (this.attached) {
						importElementFromSrc(this);
					}
				}
			}
		},
		onAttach : function () {
			this.attached = true;
			if (this.src && !this.srcHasLoaded) {
				importElementFromSrc(this);
			}
		},
		onDetach : function () {
			this.attached = false;
		},
	});
	loaderDefinition.register();



	var goro = {
		ElementDefinition : ElementDefinition
	};

	return goro;
});
