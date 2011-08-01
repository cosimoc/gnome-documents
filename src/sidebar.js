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
const Gtk = imports.gi.Gtk;
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Signals = imports.signals;

const AccountsModel = imports.accountsModel;
const Main = imports.main;

const _SIDEBAR_WIDTH_REQUEST = 240;

function SourcesPage() {
    this._init();
}

SourcesPage.prototype = {
    _init: function() {
        this._accountsModel = new AccountsModel.AccountsModel();
        this._currentSourceId = Main.settings.get_string('active-source');

        this._treeView = new Gtk.TreeView({ headers_visible: false,
                                            no_show_all: true });
        Gd.gtk_tree_view_set_activate_on_single_click(this._treeView, true);
        this.widget = this._treeView;
        this._treeView.set_model(this._accountsModel.model);

        let selection = this._treeView.get_selection();
        selection.set_mode(Gtk.SelectionMode.SINGLE);

        this._treeView.connect('row-activated', Lang.bind(this,
            function(view, path) {
                let iter = this._accountsModel.model.get_iter(path)[1];
                let id = this._accountsModel.model.get_value(iter, AccountsModel.ModelColumns.ID);
                let name = this._accountsModel.model.get_value(iter, AccountsModel.ModelColumns.NAME);

                this._currentSourceId = id;

                this.emit('source-filter-changed', id, name);
            }));

        let col = new Gtk.TreeViewColumn();
        this._treeView.append_column(col);

        this._rendererRadio = new Gtk.CellRendererToggle({ radio: true });
        col.pack_start(this._rendererRadio, false);

        col.set_cell_data_func(this._rendererRadio, Lang.bind(this,
            function(col, cell, model, iter) {
                let id = model.get_value(iter, AccountsModel.ModelColumns.ID);

                if (id == this._currentSourceId)
                    this._rendererRadio.active = true;
                else
                    this._rendererRadio.active = false;
            },
            null, null));

        this._rendererText = new Gtk.CellRendererText();
        col.pack_start(this._rendererText, true);
        col.add_attribute(this._rendererText,
                          'text', AccountsModel.ModelColumns.NAME);

        this._rendererArrow = new Gtk.CellRendererPixbuf({ icon_name: 'go-next-symbolic' });
        col.pack_start(this._rendererArrow, false);
    }
};
Signals.addSignalMethods(SourcesPage.prototype);

function Sidebar() {
    this._init();
}

Sidebar.prototype = {
    _init: function() {
        this.widget = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER });
        this.widget.get_style_context().add_class(Gtk.STYLE_CLASS_SIDEBAR);

        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                    border_width: 6,
                                    width_request: _SIDEBAR_WIDTH_REQUEST,
                                    column_homogeneous: true });
        this.widget.add_with_viewport(this._grid);

        let buttonContent = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL,
                                           row_spacing: 6 });
        // FIXME: setting yalign here seems wrong, but why are those not aligned
        // otherwise?
        buttonContent.add(new Gtk.Image({ icon_size: Gtk.IconSize.MENU,
                                          icon_name: 'go-previous-symbolic',
                                          yalign: 0.75 }));
        this._buttonLabel = new Gtk.Label({ label: _('Sources') });
        buttonContent.add(this._buttonLabel);

        this._sourcesButton = new Gtk.Button({ child: buttonContent });
        this._grid.add(this._sourcesButton);
        this._sourcesButton.connect('clicked', Lang.bind(this, this._onSourcesButtonClicked));

        this._sourcesPage = new SourcesPage();
        this._grid.add(this._sourcesPage.widget);
        this._sourcesPage.connect('source-filter-changed', Lang.bind(this, this._onSourceFilterChanged));

        this.widget.show_all();
    },

    _onSourcesButtonClicked: function() {
        this._sourcesButton.hide();
        this._sourcesPage.widget.show();
    },

    _onSourceFilterChanged: function(sourcePage, id, name) {
        this._sourcesPage.widget.hide();
        this._sourcesButton.show();
        this._buttonLabel.label = name;

        // forward the signal
        this.emit('source-filter-changed', id);
    }
};
Signals.addSignalMethods(Sidebar.prototype);