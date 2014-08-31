define(function (require) {
	'use strict';

	return {
		// template : require('template'),
		template : require('goro.template!src/elements/TestElement'),
		onCreate : function () {
			console.log('i exist!');
		},
		onAttach : function () {
			console.log('im attached!');
		},
	};
});
