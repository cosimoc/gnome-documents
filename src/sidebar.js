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
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Signals = imports.signals;

const Global = imports.global;
const Sources = imports.sources;

const _SIDEBAR_WIDTH_REQUEST = 240;

const _SIDEBAR_SOURCES_PAGE = 0;
const _SIDEBAR_MAIN_PAGE = 1;

const SidebarModelColumns = {
    ID: 0,
    NAME: 1,
    ICON: 2,
    HEADING: 3
};

function SidebarModel() {
    this._init();
};

SidebarModel.prototype = {
    _init: function() {
        let iter = null;

        this.model = Gd.create_sidebar_store();
        this._categoryManager = Global.categoryManager;

        let categories = this._categoryManager.categories;
        categories.forEach(Lang.bind(this,
            function(category) {
                iter = this.model.append();
                Gd.sidebar_store_set(this.model, iter,
                                     category.id, category.name, category.icon, false);
            }));
    }
};

function SidebarView() {
    this._init();
};

SidebarView.prototype = {
    _init: function() {
        this._model = new SidebarModel();
        this._treeModel = this._model.model;
        this._categoryManager = Global.categoryManager;

        this._treeView = new Gtk.TreeView({ headers_visible: false,
                                            vexpand: true });
        Gd.gtk_tree_view_set_activate_on_single_click(this._treeView, true);
        this._treeView.set_model(this._treeModel);

        this.widget = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER });
        this.widget.add(this._treeView);

        this._treeView.connect('row-activated', Lang.bind(this,
            function(view, path) {
                let iter = this._treeModel.get_iter(path)[1];
                let id = this._treeModel.get_value(iter, SidebarModelColumns.ID);

                this._categoryManager.setActiveCategoryId(id);
            }));

        let col = new Gtk.TreeViewColumn();
        this._treeView.append_column(col);

        this._rendererIcon = new Gtk.CellRendererPixbuf({ xpad: 4 });
        col.pack_start(this._rendererIcon, false);
        col.add_attribute(this._rendererIcon,
                          'icon-name', SidebarModelColumns.ICON);


        this._rendererText = new Gtk.CellRendererText();
        col.pack_start(this._rendererText, true);
        col.add_attribute(this._rendererText,
                          'text', SidebarModelColumns.NAME);

        this.widget.show_all();
    }
};

function SidebarMainPage() {
    this._init();
};

SidebarMainPage.prototype = {
    _init: function() {
        this.widget = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                     border_width: 6,
                                     width_request: _SIDEBAR_WIDTH_REQUEST,
                                     column_homogeneous: true,
                                     column_spacing: 12 });

        // sources button
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
        this.widget.add(this._sourcesButton);
        this._sourcesButton.connect('clicked', Lang.bind(this, this._onSourcesButtonClicked));

        // actual view
        this._sidebarView = new SidebarView();
        this.widget.add(this._sidebarView.widget);

        this.widget.show_all();
    },

    _onSourcesButtonClicked: function() {
        this.emit('sources-button-clicked');
    }
};
Signals.addSignalMethods(SidebarMainPage.prototype);

function Sidebar() {
    this._init();
}

Sidebar.prototype = {
    _init: function() {
        this._sourceManager = Global.sourceManager;
        this._sourceManager.connect('active-source-changed',
                                    Lang.bind(this, this._onSourceFilterChanged));

        this.widget = new Gtk.Notebook({ show_tabs: false });
        this.widget.get_style_context().add_class(Gtk.STYLE_CLASS_SIDEBAR);

        this._sourceView = new Sources.SourceView();
        this.widget.insert_page(this._sourceView.widget, null, _SIDEBAR_SOURCES_PAGE);

        this._sidebarView = new SidebarMainPage();
        this.widget.insert_page(this._sidebarView.widget, null, _SIDEBAR_MAIN_PAGE);
        this._sidebarView.connect('sources-button-clicked',
                                  Lang.bind(this, this._onSourcesButtonClicked));

        this.widget.set_current_page(_SIDEBAR_MAIN_PAGE);
        this.widget.show_all();
    },

    _onSourceFilterChanged: function(sourcePage, id, name) {
        this.widget.set_current_page(_SIDEBAR_MAIN_PAGE);
    },

    _onSourcesButtonClicked: function() {
        this.widget.set_current_page(_SIDEBAR_SOURCES_PAGE);
    }
};
