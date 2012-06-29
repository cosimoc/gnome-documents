/*
 * Copyright (C) 2012
 *
 * Gnome Documents is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gnome Documents is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Meg Ford <megford@gnome.org>
 *
 */

let MimeHandler = imports.ui.mimeHandler;
let Gtk = imports.gi.Gtk;
let GLib = imports.gi.GLib;
let WebKit = imports.gi.WebKit


function HTMLRenderer(args) {
    this._init(args);
}

HTMLRenderer.prototype = {
    _init : function(args) {
        this.moveOnClick = false;
        this.canFullScreen = true;
    },

    prepare : function(file, mainWindow, callback) {
        this._mainWindow = mainWindow;
        this._file = file;
        this._callback = callback;

        this._webView = WebKit.WebView.new();
        this._scrolledWin = Gtk.ScrolledWindow.new (null, null);
        this._scrolledWin.add(this._webView);
        this._scrolledWin.show_all();

        /* disable the default context menu of the web view */
        let settings = this._webView.settings;
        settings.enable_default_context_menu = false;

        this._webView.load_uri(file.get_uri());

        this._actor = new GtkClutter.Actor({ contents: this._scrolledWin });
        this._actor.set_reactive(true);

        this._callback();
    },

    render : function() {
        return this._actor;
    },

    getSizeForAllocation : function(allocation) {
        return allocation;
    },


****Add webdialog here; anyway that is my current theory
****


let handler = new MimeHandler.MimeHandler();
let renderer = new HTMLRenderer();

let mimeTypes = [
    'text/html'
];

handler.registerMimeTypes(mimeTypes, renderer)
