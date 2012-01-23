/*
 * Copyright (c) 2011 Red Hat, Inc.
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
 * Author: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

const Gd = imports.gi.Gd;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;

const Documents = imports.documents;
const Global = imports.global;

const Lang = imports.lang;

const _ICON_VIEW_SIZE = 128;
const _LIST_VIEW_SIZE = 48;

let debugInit = false;
let debugEnabled = false;

function getIconSize() {
    let viewType = Global.settings.get_enum('view-as');

    if (viewType == Gd.MainViewType.LIST)
        return _LIST_VIEW_SIZE;
    else
        return _ICON_VIEW_SIZE;
}

function getThumbnailFrameBorder() {
    let viewType = Global.settings.get_enum('view-as');
    let slice = new Gtk.Border();
    let border = null;

    slice.top = 3;
    slice.right = 3;
    slice.bottom = 6;
    slice.left = 4;

    if (viewType == Gd.MainViewType.LIST) {
        border = new Gtk.Border();
        border.top = 1;
        border.right = 1;
        border.bottom = 3;
        border.left = 2;
    } else {
        border = slice.copy();
    }

    return [ slice, border ];
}

function iconFromRdfType(type) {
    let iconName;

    if (type.indexOf('nfo#Spreadsheet') != -1)
        iconName = 'x-office-spreadsheet';
    else if (type.indexOf('nfo#Presentation') != -1)
        iconName = 'x-office-presentation';
    else if (type.indexOf('nfo#DataContainer') != -1)
        return Gd.create_collection_icon(getIconSize(), []);
    else
        iconName = 'x-office-document';

    return new Gio.ThemedIcon({ name: iconName });
}

function getURNsFromPaths(paths, model) {
    return paths.map(Lang.bind(this,
            function(path) {
                return getURNFromPath(path, model);
            }));
}

function getURNFromPath(path, model) {
    let iter = model.get_iter(path)[1];
    let urn = model.get_value(iter, Documents.ModelColumns.URN);

    return urn;
}

function isSearchEvent(event) {
    let keyval = event.get_keyval()[1];
    let state = event.get_state()[1];

    let retval =
        (((keyval == Gdk.KEY_f) &&
          ((state & Gdk.ModifierType.CONTROL_MASK) != 0)) ||
         ((keyval == Gdk.KEY_s) &&
          ((state & Gdk.ModifierType.CONTROL_MASK) != 0)));

    return retval;
}

function debug(str) {
    if (!debugInit) {
        let env = GLib.getenv('DOCUMENTS_DEBUG');
        if (env)
            debugEnabled = true;

        debugInit = true;
    }

    if (debugEnabled)
        log('DEBUG: ' + str);
}
