const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const Lang = imports.lang;

function MainToolbar() {
    this._init();
}

MainToolbar.prototype = {
    _init: function() {
        this._initGtkToolbar();
    },

    _initGtkToolbar: function() {
        this.toolbar = new Gtk.Toolbar({ hexpand: true,
                                         icon_size: Gtk.IconSize.MENU });
        this.toolbar.get_style_context().add_class('primary-toolbar');
    },

    _clearToolbar: function() {
        this.toolbar.foreach(Lang.bind(this, function(widget) {
            widget.destroy();
        }));
    },

    _populateForOverview: function() {
        // FIXME: need correct icons
        let iconView = new Gtk.ToggleButton({ child: new Gtk.Image({ icon_name: 'view-grid-symbolic',
                                                                     pixel_size: 16 }) });
        iconView.get_style_context().add_class('linked');
        iconView.get_style_context().add_class('raised');

        let listView = new Gtk.ToggleButton({ child: new Gtk.Image({ icon_name: 'view-list-symbolic',
                                                                     pixel_size: 16 }) });
        listView.get_style_context().add_class('linked');
        listView.get_style_context().add_class('raised');

        Main.settings.bind('list-view',
                           iconView, 'active',
                           Gio.SettingsBindFlags.INVERT_BOOLEAN);
        Main.settings.bind('list-view',
                           listView, 'active',
                           Gio.SettingsBindFlags.DEFAULT);

        let box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL,
                                spacing: 0,
                                hexpand: true });
        box.add(iconView);
        box.add(listView);

        let item = new Gtk.ToolItem();
        item.set_expand(true);
        item.add(box);

        this._searchEntry = new Gtk.Entry({ width_request: 260,
                                            secondary_icon_name: 'edit-find-symbolic',
                                            secondary_icon_sensitive: false,
                                            secondary_icon_activatable: false });
        let item2 = new Gtk.ToolItem();
        item2.add(this._searchEntry);

        this._searchEntry.connect('changed', Lang.bind(this, function() {
            let text = this._searchEntry.get_text();
            if (text && text != '') {
                this._searchEntry.secondary_icon_name = 'edit-clear-symbolic';
                this._searchEntry.secondary_icon_sensitive = true;
                this._searchEntry.secondary_icon_activatable = true;
            } else {
                this._searchEntry.secondary_icon_name = 'edit-find-symbolic';
                this._searchEntry.secondary_icon_sensitive = false;
                this._searchEntry.secondary_icon_activatable = false;
            }
        }));                

        this._searchEntry.connect('icon-release', Lang.bind(this, function() {
            this._searchEntry.set_text('');
        }));

        this.toolbar.insert(item, 0);
        this.toolbar.insert(item2, 1);
    },

    setOverview: function() {
        this._clearToolbar();
        this._populateForOverview();
    }
}
