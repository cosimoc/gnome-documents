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

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const Documents = imports.documents;
const Global = imports.global;

const Lang = imports.lang;

const _ICON_VIEW_SIZE = 128;
const _LIST_VIEW_SIZE = 48;

function getIconSize() {
    return Global.settings.get_boolean('list-view') ? _LIST_VIEW_SIZE : _ICON_VIEW_SIZE;
}

function iconFromRdfType(type) {
    let iconName;

    if (type.indexOf('nfo#Spreadsheet') != -1)
        iconName = 'x-office-spreadsheet';
    else if (type.indexOf('nfo#Presentation') != -1)
        iconName = 'x-office-presentation';
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
