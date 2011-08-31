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
const View = imports.view;
const Lang = imports.lang;

const _VIEW_ITEM_WIDTH = 140;
const _VIEW_ITEM_WRAP_WIDTH = 128;
const _VIEW_COLUMN_SPACING = 20;
const _VIEW_MARGIN = 16;

function IconView() {
    this._init();
}

IconView.prototype = {
    __proto__: View.View.prototype,

    _init: function() {
        this.widget = new Gtk.IconView({ hexpand: true,
                                         vexpand: true });

        this.widget.item_width = _VIEW_ITEM_WIDTH;
        this.widget.column_spacing = _VIEW_COLUMN_SPACING;
        this.widget.margin = _VIEW_MARGIN;
        this.widget.set_selection_mode(Gtk.SelectionMode.MULTIPLE);

        this.widget.connect('item-activated',
                            Lang.bind(this, this._onItemActivated));

        this.widget.show();

        // chain up to the parent
        View.View.prototype._init.call(this);
    },

    connectToSelectionChanged: function(callback) {
        this.getSelectionObject().connect('selection-changed', callback);
    },

    getSelection: function() {
        return this.getSelectionObject().get_selected_items();
    },

    getSelectionObject: function() {
        return this.widget;
    },

    getPathAtPos: function(position) {
        return this.widget.get_path_at_pos(position[0], position[1]);
    },

    scrollToPath: function(path) {
        this.widget.scroll_to_path(path, false, 0, 0);
    },

    createRenderers: function() {
        let pixbufRenderer =
            new Gtk.CellRendererPixbuf({ xalign: 0.5,
                                         yalign: 0.5 });

        this.widget.pack_start(pixbufRenderer, false);
        this.widget.add_attribute(pixbufRenderer,
                                'pixbuf', Documents.ModelColumns.ICON);

        let textRenderer =
            new Gd.TwoLinesRenderer({ alignment: Pango.Alignment.CENTER,
                                      wrap_mode: Pango.WrapMode.WORD_CHAR,
                                      wrap_width: _VIEW_ITEM_WRAP_WIDTH,
                                      text_lines: 3 });
        this.widget.pack_start(textRenderer, false);
        this.widget.add_attribute(textRenderer,
                                  'text', Documents.ModelColumns.TITLE);
        this.widget.add_attribute(textRenderer,
                                  'line-two', Documents.ModelColumns.AUTHOR);
    },

    _onItemActivated: function(view, path, column) {
        this.activateItem(path);
    }
};
