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
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Signals = imports.signals;

const AccountsModel = imports.accountsModel;

function Sidebar() {
    this._init();
}

Sidebar.prototype = {
    _init: function() {
        this._accountsModel = new AccountsModel.AccountsModel();
        this.widget = new Gtk.ScrolledWindow();

        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL });
        this.widget.add_with_viewport(this._grid);

        this._combobox = new Gtk.ComboBox();
        this._combobox.set_model(this._accountsModel.model);

        this._comboRenderer = new Gtk.CellRendererText();
        this._combobox.pack_start(this._comboRenderer, true);
        this._combobox.add_attribute(this._comboRenderer,
                                     "text", AccountsModel.ModelColumns.NAME);

        this._combobox.connect('changed', Lang.bind(this, this._onComboBoxChanged));
        this._combobox.set_active(0);

        this._grid.add(this._combobox);

        this.widget.show_all();
    },

    _onComboBoxChanged: function() {
        let iter = this._combobox.get_active_iter()[1];
        let id = this._accountsModel.model.get_value(iter, AccountsModel.ModelColumns.ID);

        this.emit('source-filter-changed', id);
    }
};
Signals.addSignalMethods(Sidebar.prototype);