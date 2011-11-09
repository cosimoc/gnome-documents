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

const Gtk = imports.gi.Gtk;
const Gd = imports.gi.Gd;
const Pango = imports.gi.Pango;

const Documents = imports.documents;
const Global = imports.global;
const View = imports.view;
const Lang = imports.lang;

function ListView() {
    this._init();
}

ListView.prototype = {
    __proto__: View.View.prototype,

    _init: function() {
        this.widget = new Gtk.TreeView({ enable_search: false,
                                         hexpand: true,
                                         vexpand: true,
                                         headers_visible: false });

        this.widget.connect('row-activated',
                            Lang.bind(this, this._onItemActivated));

        this.widget.show();

        // chain up to the parent
        View.View.prototype._init.call(this);
    },

    _onItemActivated: function(view, path, column) {
        this.activateItem(path);
    },

    connectToSelectionChanged: function(callback) {
        this.getSelectionObject().connect('changed', callback);
    },

    getSelectionObject: function() {
        return this.widget.get_selection();
    },

    getSelection: function() {
        return this.getSelectionObject().get_selected_rows()[0];
    },

    getPathAtPos: function(position) {
        return this.widget.get_path_at_pos(position[0], position[1])[1];
    },

    scrollToPath: function(path) {
        this.widget.scroll_to_cell(path, null, true, 0.5, 0.5);
    },

    setSelectionMode: function(mode) {
        this.getSelectionObject().set_mode(mode);
    },

    setSingleClickMode: function(mode) {
        Gd.gtk_tree_view_set_activate_on_single_click(this.widget, mode);
    },

    createRenderers: function() {
        let col = new Gtk.TreeViewColumn();
        this.widget.append_column(col);

        let pixbufRenderer =
            new Gtk.CellRendererPixbuf({ xalign: 0.5,
                                         yalign: 0.5 });

        col.pack_start(pixbufRenderer, false);
        col.add_attribute(pixbufRenderer,
                          'pixbuf', Documents.ModelColumns.ICON);

        let textRenderer =
            new Gd.TwoLinesRenderer({ alignment: Pango.Alignment.LEFT,
                                      wrap_mode: Pango.WrapMode.WORD_CHAR,
                                      xpad: 12,
                                      text_lines: 2 });
        col.pack_start(textRenderer, false);
        col.add_attribute(textRenderer,
                          'text', Documents.ModelColumns.TITLE);
        col.add_attribute(textRenderer,
                          'line-two', Documents.ModelColumns.AUTHOR);

        let typeRenderer =
            new Gtk.CellRendererText({ xpad: 16 });
        col.pack_start(typeRenderer, false);
        col.set_cell_data_func(typeRenderer, Lang.bind(this,
            function(col, cell, model, iter) {
                let urn = model.get_value(iter, Documents.ModelColumns.URN);
                let doc = Global.documentManager.getItemById(urn);

                typeRenderer.text = doc.typeDescription;
            }));

        let whereRenderer =
            new Gtk.CellRendererText({ xpad: 8 });
        col.pack_start(whereRenderer, false);
        col.set_cell_data_func(whereRenderer, Lang.bind(this,
            function(col, cell, model, iter) {
                let urn = model.get_value(iter, Documents.ModelColumns.URN);
                let doc = Global.documentManager.getItemById(urn);

                whereRenderer.text = doc.sourceName;
            }));
    }
};
