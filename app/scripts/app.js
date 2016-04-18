'use strict';

var DEFAULTS = {
	width: 640,
	height: 480,
	lineWidth: 2,
	outlineOption: 'outlineFill',
	lineColor: '#000000',
	fillColor: '#ffffff',
	tool: 'doodle',
	ghostDraw: '',
	maxUndoStackDepth: 50
};

var canvas,
	preCanvas,
	cursorCanvas,
	cxt,
	preCxt,
	cursorCxt,
	downloadLink,
	tools;

/**
 * Set up the Chrome Web Store links in the About dialog.
 */
function initCWSLinks() {
	if (window.chrome && chrome.app && chrome.app.isInstalled) {
		document.getElementById('cwsInstallLink').style.display = 'none';
		document.getElementById('cwsFeedbackLink').style.display = 'inline';
	} else {
		document.getElementById('cwsInstallLink').onclick = function (e) {
			if (chrome && chrome.webstore && chrome.webstore.install) {
				e.preventDefault();
				var cwsLink = document.querySelector('link[rel=\"chrome-webstore-item\"]').href;
				chrome.webstore.install(cwsLink, function () {
					// Change links on successful installation.
					document.getElementById('cwsInstallLink').style.display = 'none';
					document.getElementById('cwsFeedbackLink').style.display = 'inline';
				});
			}
		};
	}
}

/**
 * Get the toolbar form elements.
 */
function initToolbar() {
	var forms = document.getElementsByTagName('form');
	for (var i = 0; i < forms.length; i++) {
		forms[i].addEventListener('submit', function (e) {
			e.preventDefault();
		}, false);
	}

	document.getElementById('tools').onchange = function (e) {
		// Deactivate the current tool.
		tools[localStorage.tool].deactivate();
		// Clear the preview canvas.
		Utils.clearCanvas(preCxt);
		// Set and activate the newly-selected tool.
		localStorage.tool = e.target.value;
		tools[e.target.value].activate();
	};

	document.getElementById('lineWidth').onchange = function (e) {
		localStorage.lineWidth = e.target.value;
		// Some tools' cursors change with the line width, so reactivate the tool.
		tools[localStorage.tool].activate();
	};
	
	document.getElementById('outlineOptions').onchange = function (e) {
		localStorage.outlineOption = e.target.value;
	}

	// Set up the toolbar color picker.
	var colorPicker = document.getElementById('colorPicker'),
		colorIndicator = document.getElementById('colors'),
		colors = colorPicker.getElementsByTagName('button');
	for (var i = 0; i < colors.length; i++) {
		// Handle left click.
		colors[i].addEventListener('click', function (e) {
			if (!e.altKey && !e.ctrlKey && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				if (e.button === 0) {
					localStorage.lineColor = e.target.dataset.value;
					colorIndicator.style.borderColor = e.target.dataset.value;
					// Some tools' cursors change with the line color, so reactivate the cursor.
					tools[localStorage.tool].activate();
				}
			}
		}, false);
		// Handle right click.
		colors[i].addEventListener('contextmenu', function (e) {
			e.preventDefault();
			e.stopPropagation();
			if (e.button === 2) {
				localStorage.fillColor = e.target.dataset.value;
				colorIndicator.style.backgroundColor = e.target.dataset.value;
				// Some tools' cursors change with the fill color, so reactivate the cursor.
				tools[localStorage.tool].activate();
			}
		}, false);
	}
	// Set up the color picker dialog.
	var colorPickerDialog = document.getElementById('colorPickerDialog');
	Utils.makeDialog(colorPickerDialog);
	var colorPickers = {
		line: new ColorPicker(
			document.getElementById('lineColorSlider'),
			document.getElementById('lineColorPicker'),
			function (hex, hsv, rgb, pickerCoords) {
				updateColorFields('line', pickerCoords, hex, hsv, rgb);
			}
		),
		fill: new ColorPicker(
			document.getElementById('fillColorSlider'),
			document.getElementById('fillColorPicker'),
			function (hex, hsv, rgb, pickerCoords) {
				updateColorFields('fill', pickerCoords, hex, hsv, rgb);
			}
		)
	};
	function limitValue(value, min, max) {
		if (value < min) {
			return min;
		}
		if (value > max) {
			return max;
		}
		return value;
	}
	function updateColorPickerHex(e) {
		var type = e.target.name.match(/line|fill/)[0];
		var hex = colorPickerDialog[type + 'ColorHex'].value;
		// Quit if anything but a valid hex code was entered.
		if (!hex.match(/#[0-9A-Fa-f]{6}/)) {
			return;
		}
		colorPickers[type].setHex(hex);
	}
	function updateColorPickerHSL(e) {
		var type = e.target.name.match(/line|fill/)[0];
		var h = colorPickerDialog[type + 'ColorHue'].value || 0;
		h = limitValue(h, 0, 360);
		var s = (colorPickerDialog[type + 'ColorSaturation'].value || 0) / 100;
		s = limitValue(s, 0, 100);
		var l = (colorPickerDialog[type + 'ColorLightness'].value || 0) / 100;
		l = limitValue(l, 0, 100);
		colorPickers[type].setHsv({h: h, s: s, v: l});
	}
	function updateColorPickerRGB(e) {
		var type = e.target.name.match(/line|fill/)[0];
		var r = colorPickerDialog[type + 'ColorRed'].value || 0;
		r = limitValue(r, 0, 255);
		var g = colorPickerDialog[type + 'ColorGreen'].value || 0;
		g = limitValue(g, 0, 255);
		var b = colorPickerDialog[type + 'ColorBlue'].value || 0;
		b = limitValue(b, 0, 255);
		colorPickers[type].setRgb({r: r, g: g, b: b});
	}
	function updateColorFields(type, pickerCoords, hex, hsv, rgb) {
		hsv.h = limitValue(hsv.h, 0, 360);
		hsv.s = limitValue(hsv.s, 0, 100);
		hsv.v = limitValue(hsv.v, 0, 100);
		rgb.r = limitValue(rgb.r, 0, 255);
		rgb.g = limitValue(rgb.g, 0, 255);
		rgb.b = limitValue(rgb.b, 0, 255);
		hex = ColorPicker.rgb2hex(rgb);
		if (pickerCoords) {
			var pickerIndicator = colorPickers[type].pickerElement.getElementsByClassName('picker-indicator')[0];
			pickerIndicator.style.left = (hsv.s * 100) + '%';
			pickerIndicator.style.top = (100 - hsv.v * 100) + '%';
		}
		var sliderIndicator = colorPickers[type].slideElement.getElementsByClassName('slide-indicator')[0];
		sliderIndicator.style.top = (hsv.h / 360 * 100) + '%';

		document.getElementById(type + 'ColorSample').style.backgroundColor = hex;
		colorPickerDialog[type + 'ColorHex'].value = hex;
		colorPickerDialog[type + 'ColorHue'].value = Math.floor(hsv.h);
		colorPickerDialog[type + 'ColorSaturation'].value = Math.floor(hsv.s * 100);
		colorPickerDialog[type + 'ColorLightness'].value = Math.floor(hsv.v * 100);
		colorPickerDialog[type + 'ColorRed'].value = rgb.r;
		colorPickerDialog[type + 'ColorGreen'].value = rgb.g;
		colorPickerDialog[type + 'ColorBlue'].value = rgb.b;
	}
	colorPickerDialog.onsubmit = function (e) {
		e.preventDefault();

		if (e.target.lineColorHex.value !== '') {
			localStorage.lineColor = e.target.lineColorHex.value;
			colorIndicator.style.borderColor = e.target.lineColorHex.value;
		}
		if (e.target.fillColorHex.value !== '') {
			localStorage.fillColor = e.target.fillColorHex.value;
			colorIndicator.style.backgroundColor = e.target.fillColorHex.value;
		}

		e.target.close();
	};
	colorPickerDialog.lineColorHex.oninput =
		colorPickerDialog.fillColorHex.oninput = updateColorPickerHex;
	colorPickerDialog.lineColorHue.oninput =
		colorPickerDialog.lineColorSaturation.oninput =
		colorPickerDialog.lineColorLightness.oninput =
		colorPickerDialog.fillColorHue.oninput =
		colorPickerDialog.fillColorSaturation.oninput =
		colorPickerDialog.fillColorLightness.oninput = updateColorPickerHSL;
	colorPickerDialog.lineColorRed.oninput =
		colorPickerDialog.lineColorGreen.oninput =
		colorPickerDialog.lineColorBlue.oninput =
		colorPickerDialog.fillColorRed.oninput =
		colorPickerDialog.fillColorGreen.oninput =
		colorPickerDialog.fillColorBlue.oninput = updateColorPickerRGB;
	colorIndicator.onclick = function () {
		colorPickers.line.setHex(localStorage.lineColor);
		colorPickerDialog.lineColorHex.value = localStorage.lineColor;
		colorPickers.fill.setHex(localStorage.fillColor);
		colorPickerDialog.fillColorHex.value = localStorage.fillColor;

		colorPickerDialog.open();
	};

	// Set up the event listener for the Pac-Man easter egg.
	document.querySelector('#colorPicker button[data-value=\"#FFEB3B\"]').addEventListener('click', function (e) {
		// If the button was Ctrl+Shift+clicked...
		if (e.ctrlKey && e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			if (!window.pacMan) {
				// If Pac-Man has not been started, create and start a new Pac-Man.
				window.pacMan = new PacMan(canvas);
				window.pacMan.start();
				// Update the button to show the easter egg has been activated.
				e.target.className = 'pacman';
			} else {
				// If Pac-Man is running, delete Pac-Man.
				window.pacMan.stop();
				delete window.pacMan;
				e.target.classList.remove('pacman');
			}
		}
	}, false);

	// Clear button and dialog.
	var clearDialog = document.getElementById('clearDialog'),
		clearBtn = document.getElementById('clearBtn');
	Utils.makeDialog(clearDialog, clearBtn);
	clearDialog.onsubmit = function (e) {
		e.preventDefault();
		resetCanvas();
		// Add the change to the undo stack.
		undoStack.addState();
		e.target.close();
	};
	clearBtn.onclick = clearDialog.open;

	// Undo and redo buttons.
	document.getElementById('undoBtn').onclick = undoStack.undo.bind(undoStack);
	document.getElementById('redoBtn').onclick = undoStack.redo.bind(undoStack);

	// Resize button and dialog.
	var resizeDialog = document.getElementById('resizeDialog'),
		resizeBtn = document.getElementById('resizeBtn');
	Utils.makeDialog(resizeDialog, resizeBtn);
	resizeDialog.onsubmit = function (e) {
		e.preventDefault();

		// Fetch the values from the form.
		var width = parseInt(e.target.width.value);
		var height = parseInt(e.target.height.value);

		// Validate the user's input.
		if (!width || !height || isNaN(width) || isNaN(height) || width < 1 || height < 1) {
			alert('The dimensions you entered were invalid.');
			return;
		}

		preCxt.drawImage(canvas, 0, 0);
		canvas.width = width;
		canvas.height = height;
		resetCanvas();
		cxt.drawImage(preCanvas, 0, 0);
		preCanvas.width = width;
		preCanvas.height = height;
		localStorage.width = width;
		localStorage.height = height;

		// Add the change to the undo stack.
		undoStack.addState();

		e.target.close();
	};
	resizeBtn.onclick = function () {
		resizeDialog.width.value = localStorage.width;
		resizeDialog.height.value = localStorage.height;
		resizeDialog.open();
	};

	// Uploader.
	document.getElementById('upload').addEventListener('change', function (e) {
		console.log(e);
		if (window.File && window.FileReader && window.FileList && window.Blob) {
			var file = e.target.files[0];
			if (!file) {
				return;
			}
			if (!file.type.match('image.*')) {
				alert('PaintZ can only open valid image files.');
				return;
			}
			var reader = new FileReader();
			reader.onload = function (ev) {
				var image = new Image();
				image.src = ev.target.result;
				// There is no need to clear the canvas.  Resizing the canvas will do that.
				canvas.width = image.width;
				canvas.height = image.height;
				preCanvas.width = image.width;
				preCanvas.height = image.height;
				localStorage.width = image.width;
				localStorage.height = image.height;
				cxt.fillStyle = 'white';
				cxt.fillRect(0, 0, canvas.width, canvas.height);
				cxt.drawImage(image, 0, 0);
				
				// Clear the undo and redo stacks.
				undoStack.clear();
				
				// Set the file name.
				var fileName = file.name.replace(/\.[A-Za-z]+$/, '.png');
				downloadLink.download = fileName;
				document.title = fileName + ' - PaintZ';
			};
			reader.readAsDataURL(file);
		} else {
			alert('Please switch to a browser that supports the file APIs such as Google Chrome or Internet Explorer 11.');
		}
	}, false);
	// Open button.
	document.getElementById('openBtn').addEventListener('click', function (e) {
		document.getElementById('upload').click();
	}, false);
	// Save as button.
	document.getElementById('saveBtn').addEventListener('click', downloadImage, false);
	
	// Full screen button.
	document.getElementById('fullScreenBtn').onclick = function () {
		if (canvas.requestFullscreen) {
			canvas.requestFullscreen();
		} else if (canvas.webkitRequestFullscreen) {
			canvas.webkitRequestFullscreen();
		} else if (canvas.mozRequestFullScreen) {
			canvas.mozRequestFullScreen();
		} else if (canvas.msRequestFullscreen) {
			canvas.msRequestFullscreen();
		} else {
			alert('Sorry, your web browser does not support full screen mode.');
		}
	};
	
	// Settings button and dialog.
	var settingsDialog = document.getElementById('settingsDialog'),
		settingsBtn = document.getElementById('settingsBtn');
	Utils.makeDialog(settingsDialog, settingsBtn);
	settingsDialog.onsubmit = function (e) {
		e.preventDefault();

		if (e.target.ghostDraw.checked) {
			localStorage.ghostDraw = 'true';
			preCanvas.classList.add('ghost');
		} else {
			localStorage.ghostDraw = '';
			preCanvas.classList.remove('ghost');
		}
		
		if (e.target.maxUndoStackDepth.value !== '') {
			localStorage.maxUndoStackDepth = e.target.maxUndoStackDepth.value;
		}

		e.target.close();
	};
	settingsBtn.onclick = function () {
		settingsDialog.ghostDraw.checked = localStorage.ghostDraw;
		settingsDialog.maxUndoStackDepth.value = localStorage.maxUndoStackDepth;
		settingsDialog.open();
	};
	
	// Help button and dialog.
	var helpDialog = document.getElementById('helpDialog'),
		helpBtn = document.getElementById('helpBtn');
	Utils.makeDialog(helpDialog, helpBtn);
	helpBtn.onclick = helpDialog.open;

	// About button and dialog.
	var aboutDialog = document.getElementById('aboutDialog'),
		aboutBtn = document.getElementById('aboutBtn');
	Utils.makeDialog(aboutDialog, aboutBtn);
	aboutBtn.onclick = aboutDialog.open;
}
/**
 * Get the canvases and their drawing contexts, and set up event listeners.
 */
function initCanvas() {
	// Get the real canvas.
	canvas = document.getElementById('canvas');
	cxt = canvas.getContext('2d');
	// Get the preview canvas.
	preCanvas = document.getElementById('preCanvas');
	preCxt = preCanvas.getContext('2d');
	// Get the cursor canvas.
	cursorCanvas = document.getElementById('cursorCanvas');
	cursorCxt = cursorCanvas.getContext('2d');

	cxt.lineCap = 'round';
	preCxt.lineCap = 'round';

	// Set up event listeners for drawing.
	preCanvas.addEventListener('pointerdown', startTool, false);
	preCanvas.oncontextmenu = function (e) {
		e.preventDefault();
	};
}

/**
 * Fetch the settings from localStorage.
 */
function initSettings() {
	for (var setting in DEFAULTS) {
		if (!(setting in localStorage)) {
			localStorage[setting] = DEFAULTS[setting];
		}
	}
	canvas.width = localStorage.width;
	canvas.height = localStorage.height;
	preCanvas.width = localStorage.width;
	preCanvas.height = localStorage.height;
	if (localStorage.ghostDraw) {
		preCanvas.classList.add('ghost');
	}
	document.getElementById('lineWidth').value = localStorage.lineWidth;
	document.getElementById('outlineOptions').outlineOption.value = localStorage.outlineOption;
	document.getElementById('colors').style.borderColor = localStorage.lineColor;
	document.getElementById('colors').style.backgroundColor = localStorage.fillColor;
	document.getElementById('tools').tool.value = localStorage.tool;
}

/**
 * Initialize the tools.
 */
function initTools() {
	tools = {
		pencil: new PencilTool(cxt, preCxt),
		doodle: new DoodleTool(cxt, preCxt),
		line: new LineTool(cxt, preCxt),
		rect: new RectangleTool(cxt, preCxt),
		oval: new OvalTool(cxt, preCxt),
		eraser: new EraserTool(cxt, preCxt),
		floodFill: new FloodFillTool(cxt, preCxt),
		eyedropper: new EyedropperTool(cxt, preCxt),
		selection: new SelectionTool(cxt, preCxt),
		pan: new PanTool(cxt, preCxt)
	};
	tools[localStorage.tool].activate();
}

/**
 * Start drawing with the current tool.
 * @param {MouseEvent|TouchEvent} e
 */
function startTool(e) {
	// Quit if the left or right mouse button was not the button used.
	// (A touch is treated as a left mouse button.)
	if (e.button !== 0 && e.button !== 2) {
		return;
	}
	
	e.preventDefault();
	e.stopPropagation();
	
	// Remove the event listener for starting drawing.
	preCanvas.removeEventListener('pointerdown', startTool, false);
	
	canvas.focus();
	
	// Initialize the new shape.
	tools[localStorage.tool].start({
		button: e.button,
		x: Utils.getCanvasX(e.pageX) / zoomManager.level,
		y: Utils.getCanvasY(e.pageY) / zoomManager.level
	});
	
	// Set the event listeners to continue and end drawing.
	document.addEventListener('pointermove', moveTool, false);
	document.addEventListener('pointerup', endTool, false);
	document.addEventListener('pointerleave', endTool, false);
}

/**
 * Complete the canvas or preview canvas with the shape currently being drawn.
 * @param {MouseEvent|TouchEvent} e
 */
function moveTool(e) {
	e.preventDefault();
	e.stopPropagation();
	
	// Update the shape.
	tools[localStorage.tool].move({
		x: Utils.getCanvasX(e.pageX) / zoomManager.level,
		y: Utils.getCanvasY(e.pageY) / zoomManager.level
	});
}
/**
 * Complete the current shape and stop drawing.
 * @param {MouseEvent|TouchEvent} e
 */
function endTool(e) {
	e.preventDefault();
	e.stopPropagation();
	
	// Remove the event listeners for ending drawing.
	document.removeEventListener('pointermove', moveTool, false);
	document.removeEventListener('pointerup', endTool, false);
	document.removeEventListener('pointerleave', endTool, false);
	
	// Complete the task.
	tools[localStorage.tool].end({
		x: Utils.getCanvasX(e.pageX) / zoomManager.level,
		y: Utils.getCanvasY(e.pageY) / zoomManager.level
	});
	
	// Set the event listeners to start the next drawing.
	preCanvas.addEventListener('pointerdown', startTool, false);
}
/**
 * Overwrite the canvas with the current fill color.
 */
function resetCanvas() {
	cxt.fillStyle = localStorage.fillColor;
	cxt.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * Export the canvas content to a PNG to be saved.
 */
function downloadImage() {
	downloadLink.href = canvas.toDataURL();
	downloadLink.click();
}

window.addEventListener('load', function () {
	// Initialize everything.
	initCWSLinks();
	initToolbar();
	initCanvas();
	initSettings();
	initTools();
	zoomManager.init();
	// Get the canvas ready.
	resetCanvas();
	// Save the initial state.
	undoStack.addState();
	// Enable keyboard shortcuts.
	keyManager.enableAppShortcuts();
	
	document.title = 'untitled.png - PaintZ'
	
	downloadLink = document.getElementById('downloadLink');
	
	if (!localStorage.firstRunDone) {
		document.getElementById('helpDialog').open();
		localStorage.firstRunDone = 'true';
	}
}, false);
