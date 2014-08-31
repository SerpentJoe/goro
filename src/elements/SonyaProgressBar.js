define(function (require) {
	'use strict';

	return {
		template : require('goro.template!src/elements/SonyaProgressBar'),
		fields : {
			completion : {
				type : 'number',
				onChange : function (completion) {
					var progressEl = this.root.querySelector('.progress');
					progressEl.style.width = completion + '%';
				}
			}
		}
	};
});
