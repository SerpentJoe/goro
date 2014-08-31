define(function (require) {
	'use strict';

	return {
		template : require('goro.template!src/elements/SonyaPlanet'),
		fields : {
			sprite : {
				type : 'string',
				value : null,
				onChange : function (newVal) {
					var el = this.root.querySelector('.container');
					var cssVal = (newVal == null)
							? (null)
							: ('url(' + newVal + ')');
					el.style.backgroundImage = cssVal;
				}
			},
		},
	};
});