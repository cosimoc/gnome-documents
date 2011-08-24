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
const Goa = imports.gi.Goa;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Signals = imports.signals;

const Main = imports.main;

const _SIDEBAR_WIDTH_REQUEST = 240;

const SidebarModelColumns = {
    ID: 0,
    NAME: 1,
    HEADING: 2
};

function SidebarModel() {
    this._init();
}

SidebarModel.prototype = {
    _init: function() {
        this.model = Gd.create_sidebar_store();

        this._sourceManager = Main.sourceManager;
        this._sourceManager.connect('sources-changed', Lang.bind(this, this._refreshModel));

        this._refreshModel();
    },

    _refreshModel: function() {
        this.model.clear();

        let iter = this.model.append();
        Gd.sidebar_store_set(this.model, iter,
                             '', _("Sources"), true);

        let sources = this._sourceManager.sources;
        sources.forEach(Lang.bind(this,
            function(source) {
                iter = this.model.append();
                Gd.sidebar_store_set(this.model, iter,
                                     source.id, source.name, false);
            }));
    }
};

function SidebarView() {
    this._init();
}

SidebarView.prototype = {
    _init: function() {
        this._model = new SidebarModel();
        this._sourceManager = Main.sourceManager;

        this._treeView = new Gtk.TreeView({ headers_visible: false,
                                            no_show_all: true });
        Gd.gtk_tree_view_set_activate_on_single_click(this._treeView, true);
        this.widget = this._treeView;
        this._treeView.set_model(this._model.model);

        let selection = this._treeView.get_selection();
        selection.set_mode(Gtk.SelectionMode.SINGLE);

        this._treeView.connect('row-activated', Lang.bind(this,
            function(view, path) {
                let iter = this._model.model.get_iter(path)[1];
                let id = this._model.model.get_value(iter, SidebarModelColumns.ID);
                let name = this._model.model.get_value(iter, SidebarModelColumns.NAME);

                this._sourceManager.setActiveSourceId(id);
            }));

        let col = new Gtk.TreeViewColumn();
        this._treeView.append_column(col);

        // headings
        this._rendererHeading = new Gtk.CellRendererText({ weight: Pango.Weight.BOLD,
                                                           weight_set: true });
        col.pack_start(this._rendererHeading, false);
        col.add_attribute(this._rendererHeading,
                          'text', SidebarModelColumns.NAME);
        col.set_cell_data_func(this._rendererHeading,
            Lang.bind(this, this._visibilityForHeading, true));

        // radio selection
        this._rendererRadio = new Gtk.CellRendererToggle({ radio: true,
                                                           mode: Gtk.CellRendererMode.INERT });
        col.pack_start(this._rendererRadio, false);
        col.set_cell_data_func(this._rendererRadio,
            Lang.bind(this, this._visibilityForHeading, false,
                      Lang.bind(this,
                          function(col, cell, model, iter) {
                              let id = model.get_value(iter, SidebarModelColumns.ID);
                              if (id == this._sourceManager.getActiveSourceId())
                                  cell.active = true;
                              else
                                  cell.active = false;
                          })));

        // source name
        this._rendererText = new Gtk.CellRendererText();
        col.pack_start(this._rendererText, true);
        col.add_attribute(this._rendererText,
                          'text', SidebarModelColumns.NAME);
        col.set_cell_data_func(this._rendererText,
            Lang.bind(this, this._visibilityForHeading, false));

        // arrow
        this._rendererArrow = new Gtk.CellRendererPixbuf({ icon_name: 'go-next-symbolic',
                                                           follow_state: true });
        col.pack_start(this._rendererArrow, false);
        col.set_cell_data_func(this._rendererArrow,
            Lang.bind(this, this._visibilityForHeading, false));
    },

    _visibilityForHeading: function(col, cell, model, iter, visible, additionalFunc) {
        let heading = model.get_value(iter, SidebarModelColumns.HEADING);

        if ((visible && heading) || (!visible && !heading))
            cell.visible = true;
        else
            cell.visible = false;

        if (additionalFunc)
            additionalFunc(col, cell, model, iter);
    }
};
Signals.addSignalMethods(SidebarView.prototype);

function Sidebar() {
    this._init();
}

Sidebar.prototype = {
    _init: function() {
        this._sourceManager = Main.sourceManager;
        this._sourceManager.connect('active-source-changed',
                                    Lang.bind(this, this._onSourceFilterChanged));

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
        this._buttonLabel = new Gtk.Label({ label: _("Sources") });
        buttonContent.add(this._buttonLabel);

        this._sourcesButton = new Gtk.Button({ child: buttonContent });
        this._grid.add(this._sourcesButton);
        this._sourcesButton.connect('clicked', Lang.bind(this, this._onSourcesButtonClicked));

        this._sidebarView = new SidebarView();
        this._grid.add(this._sidebarView.widget);

        this.widget.show_all();
    },

    _onSourcesButtonClicked: function() {
        this._sourcesButton.hide();
        this._sidebarView.widget.show();
    },

    _onSourceFilterChanged: function(sourcePage, id, name) {
        this._sidebarView.widget.hide();
        this._sourcesButton.show();
    }
};
